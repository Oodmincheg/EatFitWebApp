import { NextResponse } from 'next/server';
import { getUid, readJsonBody } from '@/lib/session';
import { findUser, insertPlan, listDishes } from '@/lib/db/queries';
import { GenerationFailedError, UpstreamError, generateMealPlan } from '@/lib/llm';
import { dateKey, parseDateKey } from '@/lib/dates';
import { getLocale } from '@/lib/i18n/server';
import { pinnedWeek } from '@/lib/pins';
import { GeneratePlanBodySchema } from '@/lib/schemas';

export const runtime = 'nodejs';
export const maxDuration = 120; // generation can take up to ~60s + retry

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

// The profile is loaded from the user document so the client can't send
// stale or tampered generation inputs; the body only carries startDate.
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

  try {
    const plan = await generateMealPlan(profile, startDate, await getLocale(), pinned);
    await insertPlan(uid, plan);
    return NextResponse.json(plan);
  } catch (err) {
    console.log(err);
    if (err instanceof GenerationFailedError) {
      return NextResponse.json({ error: 'generation_failed' }, { status: 422 });
    }
    if (err instanceof UpstreamError) {
      return NextResponse.json({ error: 'upstream_error' }, { status: 502 });
    }
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
