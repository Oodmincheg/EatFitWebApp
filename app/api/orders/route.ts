import { NextResponse } from 'next/server';
import { CreateOrderBodySchema } from '@/lib/schemas';
import { BodyError, getUid, readJsonBody } from '@/lib/session';
import { createOrder, listOrders } from '@/lib/db/queries';

export const runtime = 'nodejs';

// GET /api/orders → { orders: Order[] } newest first
export async function GET() {
  const uid = await getUid();
  if (!uid) {
    return NextResponse.json({ error: 'no_session' }, { status: 401 });
  }

  try {
    const orders = await listOrders(uid);
    return NextResponse.json({ orders });
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

// POST /api/orders { items } → { order } with status "ordered"
export async function POST(req: Request) {
  const uid = await getUid();
  if (!uid) {
    return NextResponse.json({ error: 'no_session' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await readJsonBody(req, 65_536); // a full week's list can be sizeable
  } catch (e) {
    if (e instanceof BodyError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    throw e;
  }

  const parsed = CreateOrderBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_order', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const order = await createOrder(uid, parsed.data.items);
    return NextResponse.json({ order }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
