import { NextResponse } from 'next/server';
import { clearUidCookie, getUid } from '@/lib/session';
import { findUser, latestPlan } from '@/lib/db/queries';

export const runtime = 'nodejs';

// Single bootstrap call: cookie → user + profile + latest plan.
export async function GET() {
  const uid = await getUid();
  if (!uid) {
    return NextResponse.json({ error: 'no_session' }, { status: 401 });
  }

  try {
    const user = await findUser(uid);
    if (!user) {
      // Cookie present but user document gone (wiped DB) → treat as no session.
      await clearUidCookie();
      return NextResponse.json({ error: 'no_session' }, { status: 401 });
    }

    const plan = await latestPlan(uid);
    return NextResponse.json({
      user:
        user.kind === 'google'
          ? {
              kind: 'google',
              uid: user._id,
              displayName: user.displayName ?? '',
              email: user.email ?? '',
            }
          : { kind: 'guest', uid: user._id },
      profile: user.profile ?? null,
      plan,
    });
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
