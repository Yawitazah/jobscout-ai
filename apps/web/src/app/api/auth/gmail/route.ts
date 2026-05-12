import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthUrl } from "@/lib/google/oauth";

export async function GET() {
  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set("gmail_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const url = getAuthUrl(state);
  return NextResponse.redirect(url);
}
