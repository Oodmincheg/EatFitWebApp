import { NextResponse } from 'next/server';
import { BodyError, getUid, readJsonBody } from '@/lib/session';
import { GenerationFailedError, UpstreamError, parseFridgeImage } from '@/lib/llm';
import { getLocale } from '@/lib/i18n/server';
import { ParseFridgeBodySchema } from '@/lib/schemas';

export const runtime = 'nodejs';
export const maxDuration = 60;

// The image arrives as a base64 data URL, so the JSON body is bigger than
// the default readJsonBody cap.
const MAX_BODY_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  const uid = await getUid();
  if (!uid) {
    return NextResponse.json({ error: 'no_session' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await readJsonBody(req, MAX_BODY_BYTES);
  } catch (err) {
    if (err instanceof BodyError) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  const parsed = ParseFridgeBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  try {
    const items = await parseFridgeImage(parsed.data.image, await getLocale());
    return NextResponse.json({ items });
  } catch (err) {
    console.log(err);
    if (err instanceof GenerationFailedError) {
      return NextResponse.json({ error: 'parse_failed' }, { status: 422 });
    }
    if (err instanceof UpstreamError) {
      return NextResponse.json({ error: 'upstream_error' }, { status: 502 });
    }
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
