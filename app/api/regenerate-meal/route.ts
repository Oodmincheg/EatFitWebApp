import { NextResponse } from 'next/server';
import { BodyError, getUid, readJsonBody } from '@/lib/session';
import { findUser, latestPlan, replaceLatestPlan } from '@/lib/db/queries';
import { GenerationFailedError, UpstreamError, regenerateMeal } from '@/lib/llm';
import { addDays, dateKey, planStart } from '@/lib/dates';
import { getLocale } from '@/lib/i18n/server';
import { RegenerateMealBodySchema, type MealPlan, type Profile } from '@/lib/schemas';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Replace one slot of one day, leaving the other meals of that day alone.
export async function POST(req: Request) {
  const uid = await getUid();
  if (!uid) {
    return NextResponse.json({ error: 'no_session' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    if (e instanceof BodyError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    throw e;
  }

  const parsed = RegenerateMealBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { dayIndex, slot, preference } = parsed.data;
  const today = parsed.data.today ?? dateKey(new Date());

  let profile: Profile;
  let plan: MealPlan;
  try {
    const user = await findUser(uid);
    if (!user) {
      return NextResponse.json({ error: 'no_session' }, { status: 401 });
    }
    if (!user.profile) {
      return NextResponse.json({ error: 'no_profile' }, { status: 409 });
    }
    profile = user.profile;
    const current = await latestPlan(uid);
    if (!current) {
      return NextResponse.json({ error: 'no_plan' }, { status: 409 });
    }
    plan = current;
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  const day = plan.days[dayIndex];
  if (!day) {
    return NextResponse.json({ error: 'no_day' }, { status: 409 });
  }
  if (!day.meals[slot]) {
    return NextResponse.json({ error: 'no_slot' }, { status: 409 });
  }
  // A pinned slot holds the user's own dish; unpinning is the way out.
  if (day.meals[slot].dishId) {
    return NextResponse.json({ error: 'slot_pinned' }, { status: 409 });
  }
  if (dateKey(addDays(planStart(plan), dayIndex)) < today) {
    return NextResponse.json({ error: 'day_in_past' }, { status: 400 });
  }

  try {
    const updated = await regenerateMeal(profile, plan, dayIndex, slot, await getLocale(), preference?.trim() || undefined);
    await replaceLatestPlan(uid, updated);
    return NextResponse.json(updated);
  } catch (err) {
    console.error('regenerate-meal', err);
    if (err instanceof GenerationFailedError) {
      return NextResponse.json({ error: 'generation_failed' }, { status: 422 });
    }
    if (err instanceof UpstreamError) {
      return NextResponse.json({ error: 'upstream_error' }, { status: 502 });
    }
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
