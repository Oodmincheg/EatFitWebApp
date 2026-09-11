import { NextResponse } from 'next/server';
import { EstimateExtraBodySchema } from '@/lib/schemas';
import { BodyError, getUid, readJsonBody } from '@/lib/session';
import { getLocale } from '@/lib/i18n/server';
import { GenerationFailedError, UpstreamError, estimateEaten } from '@/lib/llm';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/progress/extras/estimate { text } → { name, kcal, protein_g, fat_g, carbs_g }
export async function POST(req: Request) {
  const uid = await getUid();
  if (!uid) return NextResponse.json({ error: 'no_session' }, { status: 401 });

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    if (e instanceof BodyError) return NextResponse.json({ error: e.code }, { status: e.status });
    throw e;
  }

  const parsed = EstimateExtraBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request', issues: parsed.error.issues }, { status: 400 });
  }

  try {
    return NextResponse.json(await estimateEaten(parsed.data.text, await getLocale()));
  } catch (err) {
    if (err instanceof GenerationFailedError) {
      return NextResponse.json({ error: 'generation_failed' }, { status: 422 });
    }
    if (err instanceof UpstreamError) {
      return NextResponse.json({ error: 'upstream_error' }, { status: 502 });
    }
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
