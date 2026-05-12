"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type AuthState = {
  error: string;
} | null;

function validateEmail(email: string): string {
  if (!email) return "Email is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return "Enter a valid email address.";
  return "";
}

function validatePassword(password: string): string {
  if (!password) return "Password is required.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[0-9]/.test(password))
    return "Password must include at least one number.";
  return "";
}

export async function login(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = ((formData.get("email") as string) ?? "").trim();
  const password = (formData.get("password") as string) ?? "";

  const emailErr = validateEmail(email);
  if (emailErr) return { error: emailErr };
  if (!password) return { error: "Password is required." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: "Incorrect email or password." };

  redirect("/dashboard");
}

export async function signup(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const fullName = ((formData.get("fullName") as string) ?? "").trim();
  const email = ((formData.get("email") as string) ?? "").trim();
  const password = (formData.get("password") as string) ?? "";
  const passwordConfirm = (formData.get("passwordConfirm") as string) ?? "";

  if (!fullName) return { error: "Full name is required." };

  const emailErr = validateEmail(email);
  if (emailErr) return { error: emailErr };

  const passwordErr = validatePassword(password);
  if (passwordErr) return { error: passwordErr };

  if (password !== passwordConfirm) return { error: "Passwords do not match." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });

  if (error) return { error: error.message };

  redirect("/dashboard");
}
