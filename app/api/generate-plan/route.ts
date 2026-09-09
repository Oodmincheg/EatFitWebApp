import { ObjectId } from 'mongodb';
import { NextResponse } from 'next/server';
import { getUid, readJsonBody } from '@/lib/session';
import { findUser, listDishes, savePlanDoc } from '@/lib/db/queries';
import { GenerationFailedError, UpstreamError, generateMealPlan } from '@/lib/llm';
import { dateKey, parseDateKey } from '@/lib/dates';
import { getLocale } from '@/lib/i18n/server';
import { pinnedWeek } from '@/lib/pins';
import { profilePlanDays } from '@/lib/profile';
import { GeneratePlanBodySchema, type MealPlan } from '@/lib/schemas';

export const runtime = 'nodejs';
export const maxDuration = 300; // one model call per day, run back to back

const TWO_DAYS_MS = 2 * 86_400_000;

// The plan starts "today" in the user's timezone, which only the client
// knows — accept its local date but only within 2 days of the server clock.
async function resolveStartDate(req: Request): Promise<string> {
  const serverToday = dateKey(new Date());
  try {
    const parsed = GeneratePlanBodySchema.safeParse(await readJsonBody(req));
    const claimed = parsed.success ? parsed.data.startDate : undefined;
    if (
      claimed &&
      Math.abs(parseDateKey(claimed).getTime() - parseDateKey(serverToday).getTime()) <=
        TWO_DAYS_MS
    ) {
      return claimed;
    }
  } catch {
    // Malformed/oversized body — fall through to the server date.
  }
  return serverToday;
}

// Days are generated one model call at a time and streamed as NDJSON
// ({"type":"day"} … {"type":"done"}), so the UI fills in as they land. Each
// finished day is also written to the plan document, so a run that dies
// halfway leaves a shorter but usable plan behind.
export async function POST(req: Request) {
  const uid = await getUid();
  if (!uid) {
    return NextResponse.json({ error: 'no_session' }, { status: 401 });
  }

  const startDate = await resolveStartDate(req);

  let profile;
  let pinned;
  try {
    const user = await findUser(uid);
    if (!user) {
      return NextResponse.json({ error: 'no_session' }, { status: 401 });
    }
    if (!user.profile) {
      return NextResponse.json({ error: 'no_profile' }, { status: 409 });
    }
    profile = user.profile;
    // The user's own dishes pinned per day/slot; only the other slots are generated.
    pinned = pinnedWeek(user.pins ?? {}, await listDishes(uid));
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  const totalDays = profilePlanDays(profile);
  const planId = new ObjectId();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      send({ type: 'start', totalDays, startDate });
      // Days accumulate here so a mid-run failure can still be persisted.
      let partial: MealPlan | null = null;

      try {
        const plan = await generateMealPlan(
          profile,
          startDate,
          await getLocale(),
          pinned,
          async (index, day) => {
            partial = partial
              ? { ...partial, days: [...partial.days, day] }
              : { generatedAt: new Date().toISOString(), startDate, days: [day] };
            await savePlanDoc(uid, planId, partial);
            send({ type: 'day', index, day });
          }
        );
        await savePlanDoc(uid, planId, plan);
        send({ type: 'done', plan });
      } catch (err) {
        console.error('generate-plan', err);
        const code =
          err instanceof GenerationFailedError
            ? 'generation_failed'
            : err instanceof UpstreamError
              ? 'upstream_error'
              : 'server_error';
        send({ type: 'error', error: code, partial: partial !== null });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
