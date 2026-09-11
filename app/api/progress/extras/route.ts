import { NextResponse } from 'next/server';
import { AddExtraBodySchema, RemoveExtraBodySchema } from '@/lib/schemas';
import { BodyError, getUid, readJsonBody } from '@/lib/session';
import { addProgressExtra, removeProgressExtra } from '@/lib/db/queries';

export const runtime = 'nodejs';

async function parseBody(req: Request): Promise<unknown | NextResponse> {
  try {
    return await readJsonBody(req);
  } catch (e) {
    if (e instanceof BodyError) return NextResponse.json({ error: e.code }, { status: e.status });
    throw e;
  }
}

// POST /api/progress/extras { date, name, kcal, protein_g?, fat_g?, carbs_g? } → { day: DayProgress }
export async function POST(req: Request) {
  const uid = await getUid();
  if (!uid) return NextResponse.json({ error: 'no_session' }, { status: 401 });

  const body = await parseBody(req);
  if (body instanceof NextResponse) return body;

  const parsed = AddExtraBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_extra', issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const { date, ...input } = parsed.data;
    const day = await addProgressExtra(uid, date, input);
    return NextResponse.json({ day });
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

// DELETE /api/progress/extras { date, id } → { day: DayProgress }
export async function DELETE(req: Request) {
  const uid = await getUid();
  if (!uid) return NextResponse.json({ error: 'no_session' }, { status: 401 });

  const body = await parseBody(req);
  if (body instanceof NextResponse) return body;

  const parsed = RemoveExtraBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_extra', issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const day = await removeProgressExtra(uid, parsed.data.date, parsed.data.id);
    return NextResponse.json({ day });
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
