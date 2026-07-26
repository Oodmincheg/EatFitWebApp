import 'server-only';
import { cookies } from 'next/headers';

export const COOKIE_NAME = 'mp_uid';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function getUid(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value ?? null;
}

export async function setUidCookie(uid: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, uid, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export async function clearUidCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

// Reject oversized bodies (>10 KB) and invalid JSON in one place.
export async function readJsonBody(req: Request, maxBytes = 10_240): Promise<unknown> {
  const len = req.headers.get('content-length');
  if (len && Number(len) > maxBytes) throw new BodyError(413, 'body_too_large');
  const text = await req.text();
  if (text.length > maxBytes) throw new BodyError(413, 'body_too_large');
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new BodyError(400, 'invalid_json');
  }
}

export class BodyError extends Error {
  constructor(
    public status: number,
    public code: string
  ) {
    super(code);
  }
}
