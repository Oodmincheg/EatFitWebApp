import { NextResponse } from 'next/server';
import { SilpoCartBodySchema } from '@/lib/schemas';
import { BodyError, getUid, readJsonBody } from '@/lib/session';
import { buildCart } from '@/lib/silpo/cart';
import { silpoErrorResponse } from '@/lib/silpo/http';

export const runtime = 'nodejs';
export const maxDuration = 60; // translation + batch searches + LLM pick

// POST /api/cart/silpo { items } → SilpoCart (read-only: nothing is written
// to the user's Silpo cart until /commit). Unmatched lines come back with
// product: null.
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

  const parsed = SilpoCartBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad_request', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const cart = await buildCart(uid, new URL(req.url).origin, parsed.data.items);
    return NextResponse.json(cart);
  } catch (err) {
    return silpoErrorResponse(err);
  }
}
