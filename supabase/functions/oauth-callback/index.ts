// One-time OAuth callback for Strava + Withings.
//
// Flow (see README for the authorize URLs you open in a browser):
//   1. You open the provider's authorize URL with redirect_uri pointing at this function
//      (e.g. https://<ref>.supabase.co/functions/v1/oauth-callback?provider=strava).
//   2. The provider redirects back here with ?code=...  (&provider is preserved in redirect_uri).
//   3. We exchange the code for tokens and store them in oauth_tokens.
//
// This function must be deployed with verify_jwt = false (see supabase/config.toml) so the
// browser redirect can reach it.

import { getServiceClient } from "../_shared/supabase.ts";
import { exchangeCodeForToken, saveTokens, type Provider } from "../_shared/tokens.ts";
import { subscribeNotify } from "../_shared/withings.ts";
import { handlePreflight, text } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  // Provider can be given as ?provider=... OR as the last path segment (/oauth-callback/strava).
  // The path form avoids query strings in the redirect_uri, which Strava rejects.
  const lastSegment = url.pathname.split("/").filter(Boolean).pop();
  const provider = (url.searchParams.get("provider") ??
    (lastSegment === "strava" || lastSegment === "withings" ? lastSegment : null)) as
    | Provider
    | null;

  if (error) return text(`OAuth error from provider: ${error}`, 400);
  if (provider !== "strava" && provider !== "withings") {
    return text(
      "Missing or invalid provider (expected /oauth-callback/strava, /oauth-callback/withings, or ?provider=)",
      400,
    );
  }
  if (!code) return text("Missing ?code=", 400);

  const redirectUri =
    provider === "strava"
      ? Deno.env.get("STRAVA_REDIRECT_URI")!
      : Deno.env.get("WITHINGS_REDIRECT_URI")!;

  try {
    const client = getServiceClient();
    const tokens = await exchangeCodeForToken(provider, code, redirectUri);
    await saveTokens(client, provider, tokens);

    let extra = "";
    if (provider === "withings") {
      // Auto-register the weight notification subscription so you don't have to do it manually.
      const callbackUrl = `${url.origin}/functions/v1/withings-webhook`;
      try {
        extra = `\n${await subscribeNotify(tokens.accessToken, callbackUrl)}`;
      } catch (e) {
        extra = `\nNote: could not auto-subscribe to notifications (${
          e instanceof Error ? e.message : e
        }). See README to subscribe manually.`;
      }
    }

    return text(
      `✅ ${provider} connected. Tokens stored. You can close this tab.${extra}`,
      200,
    );
  } catch (e) {
    console.error("oauth-callback error", e);
    return text(`Failed to connect ${provider}: ${e instanceof Error ? e.message : e}`, 500);
  }
});
