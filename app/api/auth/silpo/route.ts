import { NextResponse } from 'next/server';
import { getUid } from '@/lib/session';
import { isSilpoLinked, unlinkSilpo } from '@/lib/silpo/auth';

export const runtime = 'nodejs';

// GET /api/auth/silpo → { linked }
export async function GET() {
  const uid = await getUid();
  if (!uid) return NextResponse.json({ error: 'no_session' }, { status: 401 });
  try {
    return NextResponse.json({ linked: await isSilpoLinked(uid) });
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

// DELETE /api/auth/silpo → forget the user's Silpo tokens
export async function DELETE() {
  const uid = await getUid();
  if (!uid) return NextResponse.json({ error: 'no_session' }, { status: 401 });
  try {
    await unlinkSilpo(uid);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
