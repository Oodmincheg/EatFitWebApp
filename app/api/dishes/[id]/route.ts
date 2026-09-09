import { NextResponse } from 'next/server';
import { DishInputSchema } from '@/lib/schemas';
import { BodyError, getUid, readJsonBody } from '@/lib/session';
import {
  deleteDish,
  getPins,
  latestPlan,
  replaceLatestPlan,
  savePins,
  updateDish,
} from '@/lib/db/queries';
import { refreshDishInPlan, removeDishFromPins, unlinkDishInPlan } from '@/lib/pins';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

// PUT /api/dishes/:id → { dish, plan } — plan slots pinned to it are refreshed.
export async function PUT(req: Request, { params }: Params) {
  const uid = await getUid();
  if (!uid) return NextResponse.json({ error: 'no_session' }, { status: 401 });

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    if (e instanceof BodyError) return NextResponse.json({ error: e.code }, { status: e.status });
    throw e;
  }

  const parsed = DishInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_dish', issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const { id } = await params;
    const dish = await updateDish(uid, id, parsed.data);
    if (!dish) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    let plan = await latestPlan(uid);
    if (plan) {
      plan = refreshDishInPlan(plan, dish);
      await replaceLatestPlan(uid, plan);
    }
    return NextResponse.json({ dish, plan });
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

// DELETE /api/dishes/:id → { ok, pins, plan } — its pins go, plan slots keep
// the meal but lose the link.
export async function DELETE(_req: Request, { params }: Params) {
  const uid = await getUid();
  if (!uid) return NextResponse.json({ error: 'no_session' }, { status: 401 });

  try {
    const { id } = await params;
    const deleted = await deleteDish(uid, id);
    if (!deleted) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const pins = removeDishFromPins(await getPins(uid), id);
    await savePins(uid, pins);

    let plan = await latestPlan(uid);
    if (plan) {
      plan = unlinkDishInPlan(plan, id);
      await replaceLatestPlan(uid, plan);
    }
    return NextResponse.json({ ok: true, pins, plan });
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
