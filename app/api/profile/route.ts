import { NextResponse } from 'next/server';
import { ProfileInputSchema, orderSlots, type Profile } from '@/lib/schemas';
import { calorieTarget } from '@/lib/calories';
import { pantryToIngredients } from '@/lib/profile';
import { BodyError, getUid, readJsonBody } from '@/lib/session';
import { upsertProfile } from '@/lib/db/queries';

export const runtime = 'nodejs';

export async function PUT(req: Request) {
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

  const parsed = ProfileInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_profile', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  // Server recomputes the target from raw inputs — the client value is
  // display-only — unless the user pinned a target by hand.
  const { calorieTargetOverride, mealSlots } = parsed.data;
  const profile: Profile = {
    ...parsed.data,
    ...(mealSlots ? { mealSlots: orderSlots(mealSlots) } : {}),
    ingredients: pantryToIngredients(parsed.data.pantry),
    calorieTarget: calorieTargetOverride ?? calorieTarget(parsed.data),
    createdAt: new Date().toISOString(),
  };

  try {
    const matched = await upsertProfile(uid, profile);
    if (!matched) {
      return NextResponse.json({ error: 'no_session' }, { status: 401 });
    }
    return NextResponse.json({ profile });
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
