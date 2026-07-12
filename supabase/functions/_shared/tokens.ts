// Shared OAuth token store + refresh helper for Strava and Withings.
//
// Tokens live in the `oauth_tokens` table (one row per provider). Fetchers call
// getValidAccessToken(), which transparently refreshes an expired/near-expired token, persists
// the new tokens, and returns a usable access token. The one-time OAuth callback uses
// exchangeCodeForToken() + saveTokens() to seed the first row.
//
// Provider quirks handled here:
//   - Strava returns { access_token, refresh_token, expires_at (unix seconds), ... } flat.
//   - Withings wraps everything under { status, body: { ... expires_in (seconds) } } and only
//     succeeds when status === 0.

import type { SupabaseClient } from "./supabase.ts";

export type Provider = "strava" | "withings";

const REFRESH_BUFFER_S = 60; // refresh if the token expires within this many seconds

interface ProviderConfig {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
}

function providerConfig(provider: Provider): ProviderConfig {
  if (provider === "strava") {
    return {
      tokenUrl: "https://www.strava.com/oauth/token",
      clientId: reqEnv("STRAVA_CLIENT_ID"),
      clientSecret: reqEnv("STRAVA_CLIENT_SECRET"),
    };
  }
  return {
    tokenUrl: "https://wbsapi.withings.net/v2/oauth2",
    clientId: reqEnv("WITHINGS_CLIENT_ID"),
    clientSecret: reqEnv("WITHINGS_CLIENT_SECRET"),
  };
}

function reqEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export interface NormalizedTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string | null;
  raw: unknown;
}

// Parse a provider token response into a normalized shape. Works for both authorization_code
// exchanges and refreshes.
function parseTokenResponse(provider: Provider, payload: any): NormalizedTokens {
  if (provider === "strava") {
    if (!payload?.access_token) {
      throw new Error(`Strava token error: ${JSON.stringify(payload)}`);
    }
    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      // Strava gives absolute unix seconds.
      expiresAt: new Date(payload.expires_at * 1000),
      scope: payload.scope ?? null,
      raw: payload,
    };
  }

  // Withings
  if (payload?.status !== 0 || !payload?.body?.access_token) {
    throw new Error(`Withings token error: ${JSON.stringify(payload)}`);
  }
  const body = payload.body;
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    // Withings gives a relative lifetime in seconds.
    expiresAt: new Date(Date.now() + Number(body.expires_in) * 1000),
    scope: body.scope ?? null,
    raw: payload,
  };
}

async function postForm(url: string, params: Record<string, string>): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  return await res.json();
}

// Exchange an authorization code for the first set of tokens (one-time OAuth setup).
export async function exchangeCodeForToken(
  provider: Provider,
  code: string,
  redirectUri: string,
): Promise<NormalizedTokens> {
  const cfg = providerConfig(provider);
  const base: Record<string, string> = {
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    grant_type: "authorization_code",
  };
  if (provider === "withings") {
    base.action = "requesttoken";
    base.redirect_uri = redirectUri;
  } else {
    // Strava does not require redirect_uri on token exchange, but accepts it harmlessly.
    base.redirect_uri = redirectUri;
  }
  const payload = await postForm(cfg.tokenUrl, base);
  return parseTokenResponse(provider, payload);
}

// Refresh an existing token.
async function refreshToken(
  provider: Provider,
  refreshTokenValue: string,
): Promise<NormalizedTokens> {
  const cfg = providerConfig(provider);
  const base: Record<string, string> = {
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshTokenValue,
  };
  if (provider === "withings") base.action = "requesttoken";
  const payload = await postForm(cfg.tokenUrl, base);
  return parseTokenResponse(provider, payload);
}

// Persist (upsert) tokens for a provider.
export async function saveTokens(
  client: SupabaseClient,
  provider: Provider,
  tokens: NormalizedTokens,
): Promise<void> {
  const { error } = await client.from("oauth_tokens").upsert(
    {
      provider,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_at: tokens.expiresAt.toISOString(),
      scope: tokens.scope,
      raw: tokens.raw,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider" },
  );
  if (error) throw new Error(`Failed to save ${provider} tokens: ${error.message}`);
}

// Return a valid access token for the provider, refreshing + persisting if necessary.
export async function getValidAccessToken(
  client: SupabaseClient,
  provider: Provider,
): Promise<string> {
  const { data, error } = await client
    .from("oauth_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("provider", provider)
    .maybeSingle();

  if (error) throw new Error(`Failed to read ${provider} tokens: ${error.message}`);
  if (!data) {
    throw new Error(
      `No ${provider} tokens found. Complete the one-time OAuth flow first (see README).`,
    );
  }

  const expiresAt = new Date(data.expires_at).getTime();
  const needsRefresh = expiresAt - Date.now() < REFRESH_BUFFER_S * 1000;
  if (!needsRefresh) return data.access_token;

  const refreshed = await refreshToken(provider, data.refresh_token);
  await saveTokens(client, provider, refreshed);
  return refreshed.accessToken;
}
