"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { login } from "@/app/actions/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

function validateEmail(value: string): string {
  if (!value) return "Email is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    return "Enter a valid email address.";
  return "";
}

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, null);

  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  function handleEmailChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (emailError) setEmailError(validateEmail(e.target.value));
  }

  function handleEmailBlur(e: React.FocusEvent<HTMLInputElement>) {
    setEmailError(validateEmail(e.target.value));
  }

  function handlePasswordBlur(e: React.FocusEvent<HTMLInputElement>) {
    setPasswordError(e.target.value ? "" : "Password is required.");
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-[#1A1A1A] mb-1">Sign in</h1>
      <p className="text-sm text-[#5A6478] mb-7">
        Enter your email and password to continue.
      </p>

      {state?.error && (
        <div
          role="alert"
          aria-live="polite"
          className="mb-5 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-[#A52A2A]"
        >
          {state.error}
        </div>
      )}

      <form action={action} noValidate className="space-y-5">
        <Input
          id="email"
          name="email"
          type="email"
          label="Email"
          autoComplete="email"
          required
          error={emailError}
          onChange={handleEmailChange}
          onBlur={handleEmailBlur}
        />

        <Input
          id="password"
          name="password"
          type="password"
          label="Password"
          autoComplete="current-password"
          required
          error={passwordError}
          onBlur={handlePasswordBlur}
        />

        <Button type="submit" loading={pending} className="w-full">
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-[#5A6478]">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-[#1A2B4C]">
          Sign up
        </Link>
      </p>
    </div>
  );
}
