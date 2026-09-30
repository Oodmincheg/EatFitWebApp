import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CookingMutationSchema } from '@/lib/schemas';
import { BodyError, getUid, readJsonBody } from '@/lib/session';
import { findUser, getDish, listDishes } from '@/lib/db/queries';
import { insertCookingPlan, latestCookingPlan, listCookingPlans, updateCookingPlan } from '@/lib/db/cookingPlans';
import { applyCookingAction, CookingPlanError, createCookingPlan, seedCookingPins } from '@/lib/cookingPlan';
import { profileSlots } from '@/lib/profile';

export const runtime = 'nodejs';

export async function GET() {
  const uid = await getUid();
  if (!uid) return NextResponse.json({ error: 'no_session' }, { status: 401 });
  try {
    return NextResponse.json({ plans: await listCookingPlans(uid) });
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const uid = await getUid();
  if (!uid) return NextResponse.json({ error: 'no_session' }, { status: 401 });
  try {
    const parsed = CookingMutationSchema.safeParse(await readJsonBody(req));
    if (!parsed.success) return NextResponse.json({ error: 'bad_request', issues: parsed.error.issues }, { status: 400 });
    const { action, planId, revision } = parsed.data;
    if (action.type === 'create') {
      const user = await findUser(uid);
      if (!user?.profile) return NextResponse.json({ error: 'no_profile' }, { status: 409 });
      const empty = createCookingPlan(randomUUID(), action.startDate, action.dayCount, profileSlots(user.profile), new Date().toISOString());
      const plan = seedCookingPins(empty, user.pins ?? {}, await listDishes(uid), randomUUID);
      await insertCookingPlan(uid, plan);
      return NextResponse.json({ plan });
    }
    const current = await latestCookingPlan(uid);
    if (!current || current.id !== planId || current.revision !== revision) return NextResponse.json({ error: 'plan_conflict' }, { status: 409 });
    const dish = action.type === 'cook' ? await getDish(uid, action.dishId) : undefined;
    const plan = applyCookingAction(current, action, dish ?? undefined, randomUUID());
    if (!await updateCookingPlan(uid, plan, current.revision)) return NextResponse.json({ error: 'plan_conflict' }, { status: 409 });
    return NextResponse.json({ plan });
  } catch (error) {
    if (error instanceof BodyError) return NextResponse.json({ error: error.code }, { status: error.status });
    if (error instanceof CookingPlanError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'bad_request', issues: error.issues }, { status: 400 });
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
