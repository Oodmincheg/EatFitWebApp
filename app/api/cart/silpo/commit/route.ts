import { NextResponse } from 'next/server';
import { SilpoCommitBodySchema } from '@/lib/schemas';
import { BodyError, getUid, readJsonBody } from '@/lib/session';
import { commitCart } from '@/lib/silpo/cart';
import { silpoErrorResponse } from '@/lib/silpo/http';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/cart/silpo/commit { cartId, timeslot?, lines } → SilpoCommitResult
// Writes the reviewed lines into the user's real Silpo cart.
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

  const parsed = SilpoCommitBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad_request', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const result = await commitCart(uid, new URL(req.url).origin, parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    return silpoErrorResponse(err);
  }
}
