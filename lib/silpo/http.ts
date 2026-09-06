import 'server-only';
import { NextResponse } from 'next/server';
import { SilpoToolError, SilpoUnlinkedError, SilpoUpstreamError } from './client';
import { SilpoNoCartError } from './cart';

// Shared error → HTTP mapping for the Silpo cart routes. `silpo_unlinked`
// is deliberately distinct from `no_session`: the client shows "Connect
// Silpo", not a logout.
export function silpoErrorResponse(err: unknown): NextResponse {
  if (err instanceof SilpoUnlinkedError) {
    return NextResponse.json({ error: 'silpo_unlinked' }, { status: 401 });
  }
  if (err instanceof SilpoNoCartError) {
    return NextResponse.json({ error: 'no_cart' }, { status: 409 });
  }
  if (err instanceof SilpoToolError || err instanceof SilpoUpstreamError) {
    console.log(err);
    return NextResponse.json({ error: 'upstream_error', detail: err.message }, { status: 502 });
  }
  console.log(err);
  return NextResponse.json({ error: 'server_error' }, { status: 500 });
}
