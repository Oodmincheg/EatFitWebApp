// Local-dev Silpo MCP client: OAuth 2.1 + PKCE with dynamic client
// registration, state kept in the gitignored .silpo-oauth.local.json.
// Shared by scripts/silpo-*.mts; the app itself uses a Mongo-backed provider.
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UnauthorizedError, type OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';

export const SERVER_URL = process.env.SILPO_MCP_URL ?? 'https://mcp.silpo.ua/mcp';
export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PORT = 3939;
const REDIRECT_URL = `http://localhost:${PORT}/callback`;
const STATE_FILE = `${ROOT}.silpo-oauth.local.json`;

type Stored = {
  clientInformation?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  codeVerifier?: string;
  state?: string;
  authorizationUrl?: string;
};

function load(): Stored {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as Stored;
  } catch {
    return {};
  }
}
function save(patch: Partial<Stored>): void {
  writeFileSync(STATE_FILE, JSON.stringify({ ...load(), ...patch }, null, 2));
}

class FileProvider implements OAuthClientProvider {
  authorizationUrl: URL | undefined;

  get redirectUrl(): string {
    return REDIRECT_URL;
  }
  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'EatFit',
      redirect_uris: [REDIRECT_URL],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }
  state(): string {
    const state = randomBytes(16).toString('hex');
    save({ state });
    return state;
  }
  clientInformation(): OAuthClientInformationMixed | undefined {
    return load().clientInformation;
  }
  saveClientInformation(clientInformation: OAuthClientInformationMixed): void {
    save({ clientInformation });
  }
  tokens(): OAuthTokens | undefined {
    return load().tokens;
  }
  saveTokens(tokens: OAuthTokens): void {
    save({ tokens });
  }
  redirectToAuthorization(url: URL): void {
    this.authorizationUrl = url;
    save({ authorizationUrl: url.toString() });
  }
  saveCodeVerifier(codeVerifier: string): void {
    save({ codeVerifier });
  }
  codeVerifier(): string {
    const v = load().codeVerifier;
    if (!v) throw new Error('no PKCE code verifier stored');
    return v;
  }
  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): void {
    const s = load();
    if (scope === 'all' || scope === 'tokens') delete s.tokens;
    if (scope === 'all' || scope === 'client') delete s.clientInformation;
    if (scope === 'all' || scope === 'verifier') delete s.codeVerifier;
    writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
  }
}

function waitForCode(expectedState: string | undefined): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      const fail = (msg: string) => {
        res.end(`<p>${msg}</p>`);
        server.close();
        reject(new Error(msg));
      };
      if (error || !code) return fail(`Authorization failed: ${error ?? 'no code returned'}`);
      if (expectedState && state !== expectedState) return fail('OAuth state mismatch');
      res.end('<p>EatFit is connected to Silpo. You can close this tab.</p>');
      server.close();
      resolve(code);
    });
    server.listen(PORT);
    setTimeout(
      () => {
        server.close();
        reject(new Error('timed out waiting for the browser callback'));
      },
      5 * 60_000
    ).unref();
  });
}

function newClient(provider: FileProvider) {
  const transport = new StreamableHTTPClientTransport(new URL(SERVER_URL), {
    authProvider: provider,
  });
  const client = new Client({ name: 'eatfit', version: '0.1.0' }, { capabilities: {} });
  return { transport, client };
}

// Connects with stored tokens; on 401 runs the browser flow once and reconnects.
export async function connectLocal() {
  const provider = new FileProvider();
  const first = newClient(provider);
  try {
    await first.client.connect(first.transport);
    return first;
  } catch (e) {
    if (!(e instanceof UnauthorizedError)) throw e;
  }
  if (!provider.authorizationUrl) throw new Error('unauthorized, but no authorization URL was produced');

  const url = provider.authorizationUrl.toString();
  console.log(`\nLog in to Silpo in the browser tab that just opened. If none did, open:\n\n${url}\n`);
  spawn('open', [url], { stdio: 'ignore', detached: true }).unref();

  const code = await waitForCode(load().state);
  await first.transport.finishAuth(code);
  save({ authorizationUrl: undefined });

  const second = newClient(provider);
  await second.client.connect(second.transport);
  return second;
}

// Tool results carry the JSON both as text and as structuredContent; prefer the
// latter. Tool-level failures arrive as isError + plain text ("Error in
// get-time-slots: API returned 400 Bad Request."), surfaced as { error }.
export function resultJson(result: {
  isError?: boolean;
  structuredContent?: unknown;
  content?: unknown;
}): unknown {
  const content = result.content as Array<{ type: string; text?: string }> | undefined;
  const text = content?.find((c) => c.type === 'text')?.text ?? '';
  if (result.isError) return { error: text };
  if (result.structuredContent !== undefined) return result.structuredContent;
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { error: text };
  }
}
