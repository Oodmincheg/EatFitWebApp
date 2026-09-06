import { NextResponse } from 'next/server';
import { getUid } from '@/lib/session';
import { expectedState } from '@/lib/silpo/auth';
import { finishSilpoAuth } from '@/lib/silpo/client';

export const runtime = 'nodejs';

// OAuth redirect target. The mp_uid cookie identifies the user; `state`
// must match the one stored for them when the flow started.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const uid = await getUid();
  if (!uid) return NextResponse.redirect(new URL('/', origin));

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  if (error || !code) {
    return NextResponse.redirect(
      new URL(`/dashboard/cart?silpo=${encodeURIComponent(error ?? 'denied')}`, origin)
    );
  }

  try {
    const expected = await expectedState(uid);
    if (!expected || state !== expected) {
      return NextResponse.redirect(new URL('/dashboard/cart?silpo=state_mismatch', origin));
    }
    await finishSilpoAuth(uid, origin, code);
    return NextResponse.redirect(new URL('/dashboard/cart?silpo=linked', origin));
  } catch (err) {
    console.log(err);
    return NextResponse.redirect(new URL('/dashboard/cart?silpo=error', origin));
  }
}
