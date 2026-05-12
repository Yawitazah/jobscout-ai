import { OAuth2Client } from "google-auth-library";

function getOAuth2Client() {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI!
  );
}

export function getAuthUrl(state: string): string {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    state,
  });
}

export async function exchangeCode(
  code: string
): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: Date | null }> {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);
  return {
    accessToken: tokens.access_token ?? "",
    refreshToken: tokens.refresh_token ?? null,
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
  };
}

export async function getUserEmail(accessToken: string): Promise<string> {
  const client = getOAuth2Client();
  client.setCredentials({ access_token: accessToken });
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  return data.email as string;
}
