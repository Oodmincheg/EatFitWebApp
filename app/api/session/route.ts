import { NextResponse } from 'next/server';
import { SessionBodySchema } from '@/lib/schemas';
import { BodyError, clearUidCookie, getUid, readJsonBody, setUidCookie } from '@/lib/session';
import {
  createGuestUser,
  findOrCreateGoogleUser,
  latestPlan,
  type UserDoc,
} from '@/lib/db/queries';

export const runtime = 'nodejs';

// DEMO SIMPLIFICATION (spec §5.1): we decode the Firebase ID token payload
// WITHOUT verifying its signature (no firebase-admin). Auth is spoofable —
// acceptable for a hackathon demo, never for production.
function decodeIdToken(idToken: string): {
  firebaseUid: string;
  email: string;
  displayName: string;
} | null {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString());
    if (typeof payload.user_id !== 'string' && typeof payload.sub !== 'string') return null;
    return {
      firebaseUid: payload.user_id ?? payload.sub,
      email: payload.email ?? '',
      displayName: payload.name ?? payload.email ?? 'Google user',
    };
  } catch {
    return null;
  }
}

function toSession(user: UserDoc) {
  return user.kind === 'google'
    ? {
        kind: 'google',
        uid: user._id,
        displayName: user.displayName ?? '',
        email: user.email ?? '',
      }
    : { kind: 'guest', uid: user._id };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    if (e instanceof BodyError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    throw e;
  }

  const parsed = SessionBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  try {
    let user: UserDoc;
    if (parsed.data.idToken) {
      const google = decodeIdToken(parsed.data.idToken);
      if (!google) {
        return NextResponse.json({ error: 'invalid_token' }, { status: 400 });
      }
      const existingUid = await getUid();
      user = await findOrCreateGoogleUser(google, existingUid ?? undefined);
    } else {
      user = await createGuestUser();
    }
    await setUidCookie(user._id);
    // Include the plan: signing in with Google may switch to an existing
    // account whose plan the client hasn't seen yet.
    const plan = await latestPlan(user._id);
    return NextResponse.json({
      user: toSession(user),
      profile: user.profile ?? null,
      plan,
      pins: user.pins ?? {},
    });
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

// Logout: clear the session cookie. The user document (and a guest's data)
// stays in the DB; a guest who logs out simply can't reach it again.
export async function DELETE() {
  await clearUidCookie();
  return NextResponse.json({ ok: true });
}
