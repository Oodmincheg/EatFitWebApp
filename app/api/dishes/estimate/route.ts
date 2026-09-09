import { NextResponse } from 'next/server';
import { DishEstimateBodySchema } from '@/lib/schemas';
import { BodyError, getUid, readJsonBody } from '@/lib/session';
import { GenerationFailedError, UpstreamError, estimateDish } from '@/lib/llm';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/dishes/estimate { name?, ingredients } → { kcal, protein_g, fat_g, carbs_g }
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

  const parsed = DishEstimateBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request', issues: parsed.error.issues }, { status: 400 });
  }

  try {
    return NextResponse.json(await estimateDish(parsed.data.name, parsed.data.ingredients));
  } catch (err) {
    console.log(err);
    if (err instanceof GenerationFailedError) {
      return NextResponse.json({ error: 'generation_failed' }, { status: 422 });
    }
    if (err instanceof UpstreamError) {
      return NextResponse.json({ error: 'upstream_error' }, { status: 502 });
    }
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
