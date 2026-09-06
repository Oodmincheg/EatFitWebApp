import 'server-only';
import { randomBytes } from 'crypto';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { getDb } from '../db/client';

export const SILPO_MCP_URL = process.env.SILPO_MCP_URL ?? 'https://mcp.silpo.ua/mcp';

// Per-user OAuth state for the Silpo MCP; _id is the EatFit uid (mp_uid).
interface SilpoOAuthDoc {
  _id: string;
  tokens?: OAuthTokens;
  codeVerifier?: string;
  state?: string;
  updatedAt: string;
}

// Dynamic client registration is app-wide, one per redirect URI (the URI
// changes with the deployment origin, and Silpo binds the client to it).
interface SilpoClientDoc {
  _id: string; // redirect URI
  clientInformation: OAuthClientInformationMixed;
}

async function oauth() {
  return (await getDb()).collection<SilpoOAuthDoc>('silpo_oauth');
}
async function clients() {
  return (await getDb()).collection<SilpoClientDoc>('silpo_clients');
}

async function patch(uid: string, set: Partial<SilpoOAuthDoc>, unset: (keyof SilpoOAuthDoc)[] = []) {
  const update: Record<string, unknown> = {
    $set: { ...set, updatedAt: new Date().toISOString() },
  };
  if (unset.length) update.$unset = Object.fromEntries(unset.map((k) => [k, '']));
  await (await oauth()).updateOne({ _id: uid }, update, { upsert: true });
}

export function silpoRedirectUrl(origin: string): string {
  const base = process.env.APP_BASE_URL ?? origin;
  return `${base.replace(/\/$/, '')}/api/auth/silpo/callback`;
}

export class MongoSilpoAuthProvider implements OAuthClientProvider {
  // Set by redirectToAuthorization; the route hands it to the browser.
  authorizationUrl: URL | undefined;

  constructor(
    private readonly uid: string,
    private readonly redirect: string
  ) {}

  get redirectUrl(): string {
    return this.redirect;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'EatFit',
      redirect_uris: [this.redirect],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }

  async state(): Promise<string> {
    const state = randomBytes(16).toString('hex');
    await patch(this.uid, { state });
    return state;
  }

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    const fixed = process.env.SILPO_OAUTH_CLIENT_ID;
    if (fixed) return { client_id: fixed };
    const doc = await (await clients()).findOne({ _id: this.redirect });
    return doc?.clientInformation;
  }

  async saveClientInformation(clientInformation: OAuthClientInformationMixed): Promise<void> {
    await (await clients()).updateOne(
      { _id: this.redirect },
      { $set: { clientInformation } },
      { upsert: true }
    );
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    const doc = await (await oauth()).findOne({ _id: this.uid });
    return doc?.tokens;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await patch(this.uid, { tokens });
  }

  redirectToAuthorization(url: URL): void {
    this.authorizationUrl = url;
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    await patch(this.uid, { codeVerifier });
  }

  async codeVerifier(): Promise<string> {
    const doc = await (await oauth()).findOne({ _id: this.uid });
    if (!doc?.codeVerifier) throw new Error('no PKCE code verifier for this user');
    return doc.codeVerifier;
  }

  async invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): Promise<void> {
    const unset: (keyof SilpoOAuthDoc)[] = [];
    if (scope === 'all' || scope === 'tokens') unset.push('tokens');
    if (scope === 'all' || scope === 'verifier') unset.push('codeVerifier');
    if (unset.length) await patch(this.uid, {}, unset);
    if (scope === 'all' || scope === 'client') {
      await (await clients()).deleteOne({ _id: this.redirect });
    }
  }
}

export async function expectedState(uid: string): Promise<string | undefined> {
  const doc = await (await oauth()).findOne({ _id: uid });
  return doc?.state;
}

export async function isSilpoLinked(uid: string): Promise<boolean> {
  const doc = await (await oauth()).findOne({ _id: uid });
  return Boolean(doc?.tokens?.access_token);
}

export async function unlinkSilpo(uid: string): Promise<void> {
  await (await oauth()).deleteOne({ _id: uid });
}
