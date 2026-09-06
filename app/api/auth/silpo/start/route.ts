import { NextResponse } from 'next/server';
import { getUid } from '@/lib/session';
import { SilpoUnlinkedError, connectSilpo } from '@/lib/silpo/client';

export const runtime = 'nodejs';

// Browser navigation target: sends the user to Silpo's login if EatFit has
// no working token for them, otherwise straight back to the cart.
export async function GET(req: Request) {
  const uid = await getUid();
  const origin = new URL(req.url).origin;
  if (!uid) return NextResponse.redirect(new URL('/', origin));

  try {
    const conn = await connectSilpo(uid, origin);
    await conn.close().catch(() => {});
    return NextResponse.redirect(new URL('/dashboard/cart?silpo=linked', origin));
  } catch (err) {
    if (err instanceof SilpoUnlinkedError && err.authorizeUrl) {
      return NextResponse.redirect(err.authorizeUrl);
    }
    console.log(err);
    return NextResponse.redirect(new URL('/dashboard/cart?silpo=error', origin));
  }
}
