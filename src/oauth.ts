import * as AuthSession from "expo-auth-session";
import { t } from "./i18n";
import * as WebBrowser from "expo-web-browser";

/**
 * Account sign-in for the clouds whose access tokens expire within hours.
 *
 * Uses authorization code + PKCE, so no client secret ships in the app and no
 * backend is needed. The refresh token is kept and exchanged for a fresh access
 * token whenever the old one runs out.
 */
WebBrowser.maybeCompleteAuthSession();

export type OAuthCloud = "gdrive" | "dropbox";

export type Tokens = {
  access: string;
  refresh: string;
  /** Epoch ms when the access token stops working. */
  expires: number;
};

type Config = {
  authorize: string;
  token: string;
  scopes: string[];
  /** Extra params the provider needs to hand back a refresh token. */
  extra?: Record<string, string>;
};

const CONFIG: Record<OAuthCloud, Config> = {
  gdrive: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scopes: ["https://www.googleapis.com/auth/drive.file"],
    extra: { access_type: "offline", prompt: "consent" },
  },
  dropbox: {
    authorize: "https://www.dropbox.com/oauth2/authorize",
    token: "https://api.dropboxapi.com/oauth2/token",
    scopes: ["files.content.read", "files.content.write", "files.metadata.read"],
    extra: { token_access_type: "offline" },
  },
};

export function redirectUri(): string {
  return AuthSession.makeRedirectUri({ scheme: "opencodemobile", path: "oauth" });
}

function discovery(cloud: OAuthCloud): AuthSession.DiscoveryDocument {
  return {
    authorizationEndpoint: CONFIG[cloud].authorize,
    tokenEndpoint: CONFIG[cloud].token,
  };
}

/** Opens the provider's sign-in page and exchanges the code for tokens. */
export async function signIn(cloud: OAuthCloud, clientId: string): Promise<Tokens> {
  if (!clientId) throw new Error(t("oauth.noClientId"));
  const cfg = CONFIG[cloud];
  const redirect = redirectUri();

  const request = new AuthSession.AuthRequest({
    clientId,
    scopes: cfg.scopes,
    redirectUri: redirect,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    extraParams: cfg.extra,
  });

  const result = await request.promptAsync(discovery(cloud));
  if (result.type === "cancel" || result.type === "dismiss") throw new Error(t("oauth.cancelled"));
  if (result.type !== "success") throw new Error(t("oauth.failed"));
  const code = result.params.code;
  if (!code) throw new Error(result.params.error_description || result.params.error || t("oauth.noCode"));

  const token = await AuthSession.exchangeCodeAsync(
    {
      clientId,
      code,
      redirectUri: redirect,
      extraParams: { code_verifier: request.codeVerifier || "" },
    },
    discovery(cloud),
  );

  if (!token.accessToken) throw new Error(t("oauth.noToken"));
  return {
    access: token.accessToken,
    refresh: token.refreshToken || "",
    expires: Date.now() + (token.expiresIn || 3600) * 1000,
  };
}

/** Trades the stored refresh token for a new access token. */
export async function refresh(cloud: OAuthCloud, clientId: string, refreshToken: string): Promise<Tokens> {
  const token = await AuthSession.refreshAsync({ clientId, refreshToken }, discovery(cloud));
  if (!token.accessToken) throw new Error(t("oauth.refreshFailed"));
  return {
    access: token.accessToken,
    refresh: token.refreshToken || refreshToken,
    expires: Date.now() + (token.expiresIn || 3600) * 1000,
  };
}

/** True when the access token is gone or about to expire. */
export function stale(t: Tokens | undefined): boolean {
  return !t || !t.access || t.expires - Date.now() < 60_000;
}
