import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { exchangeCode, getUserEmail } from "@/lib/google/oauth";
import { encrypt } from "@/lib/google/encrypt";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL("/settings/email?error=denied", req.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/settings/email?error=invalid", req.url));
  }

  const cookieStore = await cookies();
  const savedState = cookieStore.get("gmail_oauth_state")?.value;
  cookieStore.delete("gmail_oauth_state");

  if (!savedState || savedState !== state) {
    return NextResponse.redirect(new URL("/settings/email?error=state_mismatch", req.url));
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  let tokens: { accessToken: string; refreshToken: string | null; expiresAt: Date | null };
  try {
    tokens = await exchangeCode(code);
  } catch {
    return NextResponse.redirect(new URL("/settings/email?error=token_exchange", req.url));
  }

  let emailAddress: string;
  try {
    emailAddress = await getUserEmail(tokens.accessToken);
  } catch {
    return NextResponse.redirect(new URL("/settings/email?error=userinfo", req.url));
  }

  const encryptedAccess = encrypt(tokens.accessToken);
  const encryptedRefresh = tokens.refreshToken ? encrypt(tokens.refreshToken) : null;

  const { error: upsertError } = await supabase.from("email_connections").upsert(
    {
      user_id: user.id,
      provider: "gmail",
      email_address: emailAddress,
      access_token: encryptedAccess,
      refresh_token: encryptedRefresh,
      token_expires_at: tokens.expiresAt?.toISOString() ?? null,
      is_active: true,
    },
    { onConflict: "user_id,email_address" }
  );

  if (upsertError) {
    return NextResponse.redirect(new URL("/settings/email?error=db", req.url));
  }

  return NextResponse.redirect(new URL("/settings/email?connected=true", req.url));
}
