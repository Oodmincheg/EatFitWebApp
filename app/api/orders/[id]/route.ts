import { NextResponse } from 'next/server';
import { UpdateOrderBodySchema } from '@/lib/schemas';
import { BodyError, getUid, readJsonBody } from '@/lib/session';
import { updateOrderStatus } from '@/lib/db/queries';

export const runtime = 'nodejs';

// PATCH /api/orders/:id { status } → { order }
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const parsed = UpdateOrderBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_status' }, { status: 400 });
  }

  try {
    const { id } = await params;
    const order = await updateOrderStatus(uid, id, parsed.data.status);
    if (!order) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ order });
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
