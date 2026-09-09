import { NextResponse } from 'next/server';
import { getUid, readJsonBody } from '@/lib/session';
import { findUser, latestPlan, listDishes, replaceLatestPlan } from '@/lib/db/queries';
import { GenerationFailedError, UpstreamError, regenerateMealPlanDay } from '@/lib/llm';
import { addDays, dateKey, parseDateKey, planStart } from '@/lib/dates';
import { getLocale } from '@/lib/i18n/server';
import { pinnedWeek } from '@/lib/pins';
import { RegenerateDayBodySchema } from '@/lib/schemas';

export const runtime = 'nodejs';
export const maxDuration = 120; // generation can take up to ~60s + retry

const TWO_DAYS_MS = 2 * 86_400_000;

// Regenerate a single day of the current plan. The profile and plan are
// loaded server-side; the body only carries the day index, an optional
// free-text preference, and the client's local date.
export async function POST(req: Request) {
  const uid = await getUid();
  if (!uid) {
    return NextResponse.json({ error: 'no_session' }, { status: 401 });
  }

  let parsed;
  try {
    parsed = RegenerateDayBodySchema.safeParse(await readJsonBody(req));
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const { dayIndex, preference } = parsed.data;

  // "Today" is a local-date concept only the client knows — accept its claim
  // within 2 days of the server clock (same rule as plan generation).
  const serverToday = dateKey(new Date());
  const claimed = parsed.data.today;
  const today =
    claimed &&
    Math.abs(parseDateKey(claimed).getTime() - parseDateKey(serverToday).getTime()) <=
      TWO_DAYS_MS
      ? claimed
      : serverToday;

  let profile;
  let plan;
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
    plan = await latestPlan(uid);
    if (!plan) {
      return NextResponse.json({ error: 'no_plan' }, { status: 409 });
    }
    pinned = pinnedWeek(user.pins ?? {}, await listDishes(uid));
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  // Past days are history — only today and future days may change.
  const dayDate = dateKey(addDays(planStart(plan), dayIndex));
  if (dayDate < today) {
    return NextResponse.json({ error: 'day_in_past' }, { status: 400 });
  }

  try {
    const updated = await regenerateMealPlanDay(
      profile,
      plan,
      dayIndex,
      await getLocale(),
      pinned[plan.days[dayIndex].day] ?? {},
      preference?.trim() || undefined
    );
    await replaceLatestPlan(uid, updated);
    return NextResponse.json(updated);
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
