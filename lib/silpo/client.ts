import 'server-only';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { MongoSilpoAuthProvider, SILPO_MCP_URL, silpoRedirectUrl } from './auth';

// The user has not linked Silpo (or the token died); `authorizeUrl` is set
// when the SDK produced a fresh authorization URL during this attempt.
export class SilpoUnlinkedError extends Error {
  constructor(public readonly authorizeUrl?: string) {
    super('silpo_unlinked');
  }
}
// The server ran the tool and reported a failure (isError + text).
export class SilpoToolError extends Error {}
// Transport failure or a result that does not match its schema.
export class SilpoUpstreamError extends Error {}

export interface SilpoConnection {
  client: Client;
  close: () => Promise<void>;
}

function newTransport(provider: MongoSilpoAuthProvider) {
  return new StreamableHTTPClientTransport(new URL(SILPO_MCP_URL), { authProvider: provider });
}

export async function connectSilpo(uid: string, origin: string): Promise<SilpoConnection> {
  const provider = new MongoSilpoAuthProvider(uid, silpoRedirectUrl(origin));
  const transport = newTransport(provider);
  const client = new Client({ name: 'eatfit', version: '0.1.0' }, { capabilities: {} });
  try {
    await client.connect(transport);
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      throw new SilpoUnlinkedError(provider.authorizationUrl?.toString());
    }
    throw new SilpoUpstreamError(e instanceof Error ? e.message : 'connect failed');
  }
  return { client, close: () => client.close() };
}

// Exchange the authorization code from the OAuth callback for tokens.
export async function finishSilpoAuth(uid: string, origin: string, code: string): Promise<void> {
  const provider = new MongoSilpoAuthProvider(uid, silpoRedirectUrl(origin));
  await newTransport(provider).finishAuth(code);
}

type RawResult = {
  isError?: boolean;
  structuredContent?: unknown;
  content?: Array<{ type: string; text?: string }>;
};

// Results carry the JSON as structuredContent (and a text copy); tool-level
// failures arrive as isError with plain text such as
// "Error in get-time-slots: API returned 400 Bad Request."
export async function callTool<S extends z.ZodTypeAny>(
  client: Client,
  name: string,
  args: Record<string, unknown>,
  schema: S
): Promise<z.infer<S>> {
  let res: RawResult;
  try {
    res = (await client.callTool({ name, arguments: args })) as RawResult;
  } catch (e) {
    if (e instanceof UnauthorizedError) throw new SilpoUnlinkedError();
    throw new SilpoUpstreamError(`${name}: ${e instanceof Error ? e.message : 'call failed'}`);
  }
  const text = res.content?.find((c) => c.type === 'text')?.text ?? '';
  if (res.isError) throw new SilpoToolError(text || `${name} failed`);

  let data: unknown = res.structuredContent;
  if (data === undefined) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new SilpoUpstreamError(`${name}: non-JSON result`);
    }
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new SilpoUpstreamError(`${name}: ${first.path.join('.')}: ${first.message}`);
  }
  return parsed.data;
}

export async function withSilpo<T>(
  uid: string,
  origin: string,
  fn: (client: Client) => Promise<T>
): Promise<T> {
  const conn = await connectSilpo(uid, origin);
  try {
    return await fn(conn.client);
  } finally {
    await conn.close().catch(() => {});
  }
}
