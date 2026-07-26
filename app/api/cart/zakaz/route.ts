import { NextResponse } from 'next/server';
import { ZakazCartBodySchema } from '@/lib/schemas';
import { BodyError, getUid, readJsonBody } from '@/lib/session';
import { ZakazUpstreamError, buildCart } from '@/lib/zakaz';

export const runtime = 'nodejs';
export const maxDuration = 60; // translation + N parallel searches

// POST /api/cart/zakaz { items, storeId? } → ZakazCart
// Matches the shopping list against live Zakaz.ua products. Partial matches are
// not an error: unmatched lines come back with product: null and a search link.
export async function POST(req: Request) {
  const uid = await getUid();
  if (!uid) {
    return NextResponse.json({ error: 'no_session' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await readJsonBody(req, 65_536);
  } catch (e) {
    if (e instanceof BodyError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    throw e;
  }

  const parsed = ZakazCartBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad_request', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const cart = await buildCart(parsed.data.items, parsed.data.storeId);
    return NextResponse.json(cart);
  } catch (err) {
    if (err instanceof ZakazUpstreamError) {
      return NextResponse.json({ error: 'upstream_error' }, { status: 502 });
    }
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
