import { NextResponse } from 'next/server';
import { PantryBodySchema } from '@/lib/schemas';
import { BodyError, getUid, readJsonBody } from '@/lib/session';
import { updatePantry } from '@/lib/db/queries';

export const runtime = 'nodejs';

// The pantry alone, without the rest of the profile: saving groceries must
// not restamp `createdAt` and flag the current plan as outdated.
export async function PUT(req: Request) {
  const uid = await getUid();
  if (!uid) {
    return NextResponse.json({ error: 'no_session' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await readJsonBody(req, 20_480);
  } catch (e) {
    if (e instanceof BodyError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    throw e;
  }

  const parsed = PantryBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_pantry', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const profile = await updatePantry(uid, parsed.data.pantry);
    if (!profile) {
      return NextResponse.json({ error: 'no_profile' }, { status: 409 });
    }
    return NextResponse.json({ profile });
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
