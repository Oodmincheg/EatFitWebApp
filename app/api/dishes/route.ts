import { NextResponse } from 'next/server';
import { DishInputSchema } from '@/lib/schemas';
import { BodyError, getUid, readJsonBody } from '@/lib/session';
import { createDish, listDishes } from '@/lib/db/queries';

export const runtime = 'nodejs';

// GET /api/dishes → { dishes: Dish[] } newest first
export async function GET() {
  const uid = await getUid();
  if (!uid) return NextResponse.json({ error: 'no_session' }, { status: 401 });
  try {
    return NextResponse.json({ dishes: await listDishes(uid) });
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

// POST /api/dishes { name, kcal, protein_g, fat_g, carbs_g, ingredients } → { dish }
export async function POST(req: Request) {
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
    const dish = await createDish(uid, parsed.data);
    return NextResponse.json({ dish }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
