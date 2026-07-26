import { NextResponse } from 'next/server';
import { DateKeySchema, ToggleProgressBodySchema } from '@/lib/schemas';
import { BodyError, getUid, readJsonBody } from '@/lib/session';
import { listProgress, toggleProgress } from '@/lib/db/queries';

export const runtime = 'nodejs';

// GET /api/progress?from=YYYY-MM-DD&to=YYYY-MM-DD → { days: DayProgress[] }
export async function GET(req: Request) {
  const uid = await getUid();
  if (!uid) {
    return NextResponse.json({ error: 'no_session' }, { status: 401 });
  }

  const url = new URL(req.url);
  const from = DateKeySchema.safeParse(url.searchParams.get('from'));
  const to = DateKeySchema.safeParse(url.searchParams.get('to'));
  if (!from.success || !to.success) {
    return NextResponse.json({ error: 'invalid_range' }, { status: 400 });
  }

  try {
    const days = await listProgress(uid, from.data, to.data);
    return NextResponse.json({ days });
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

// PUT /api/progress { date, slot, eaten } → { day: DayProgress }
export async function PUT(req: Request) {
  const uid = await getUid();
  if (!uid) {
    return NextResponse.json({ error: 'no_session' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    if (e instanceof BodyError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    throw e;
  }

  const parsed = ToggleProgressBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_progress', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const { date, slot, eaten } = parsed.data;
    const day = await toggleProgress(uid, date, slot, eaten);
    return NextResponse.json({ day });
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
