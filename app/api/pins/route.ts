import { NextResponse } from 'next/server';
import { PinBodySchema } from '@/lib/schemas';
import { BodyError, getUid, readJsonBody } from '@/lib/session';
import { getDish, getPins, latestPlan, replaceLatestPlan, setPin } from '@/lib/db/queries';
import { addDays, dateKey, parseDateKey, planStart } from '@/lib/dates';
import { applyPinToPlan, dishToMeal } from '@/lib/pins';

export const runtime = 'nodejs';

const TWO_DAYS_MS = 2 * 86_400_000;

// GET /api/pins → { pins }
export async function GET() {
  const uid = await getUid();
  if (!uid) return NextResponse.json({ error: 'no_session' }, { status: 401 });
  try {
    return NextResponse.json({ pins: await getPins(uid) });
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

// PUT /api/pins { day, slot, dishId | null, today? } → { pins, plan }
// Updates the weekly template and, when the current plan has that day today
// or later, swaps the slot in place so the change shows without regenerating.
export async function PUT(req: Request) {
  const uid = await getUid();
  if (!uid) return NextResponse.json({ error: 'no_session' }, { status: 401 });

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    if (e instanceof BodyError) return NextResponse.json({ error: e.code }, { status: e.status });
    throw e;
  }

  const parsed = PinBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request', issues: parsed.error.issues }, { status: 400 });
  }
  const { day, slot, dishId } = parsed.data;

  const serverToday = dateKey(new Date());
  const claimed = parsed.data.today;
  const today =
    claimed &&
    Math.abs(parseDateKey(claimed).getTime() - parseDateKey(serverToday).getTime()) <= TWO_DAYS_MS
      ? claimed
      : serverToday;

  try {
    const dish = dishId ? await getDish(uid, dishId) : null;
    if (dishId && !dish) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const pins = await setPin(uid, day, slot, dishId);

    let plan = await latestPlan(uid);
    if (plan) {
      const idx = plan.days.findIndex((d) => d.day === day);
      const date = idx >= 0 ? dateKey(addDays(planStart(plan), idx)) : null;
      if (date && date >= today) {
        plan = applyPinToPlan(plan, day, slot, dish ? dishToMeal(dish) : null);
        await replaceLatestPlan(uid, plan);
      }
    }
    return NextResponse.json({ pins, plan });
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
