import { NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/google/oauth";

export async function GET() {
  const state = crypto.randomUUID();
  const url = getAuthUrl(state);
  const response = NextResponse.redirect(url);
  response.cookies.set("gmail_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
