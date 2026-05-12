"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signup } from "@/app/actions/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

function validateEmail(value: string): string {
  if (!value) return "Email is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    return "Enter a valid email address.";
  return "";
}

function validatePassword(value: string): string {
  if (!value) return "Password is required.";
  if (value.length < 8) return "Password must be at least 8 characters.";
  if (!/[0-9]/.test(value)) return "Password must include at least one number.";
  return "";
}

export default function SignupPage() {
  const [state, action, pending] = useActionState(signup, null);

  const [fullNameError, setFullNameError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordValue, setPasswordValue] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmError, setConfirmError] = useState("");

  function handleFullNameBlur(e: React.FocusEvent<HTMLInputElement>) {
    setFullNameError(e.target.value.trim() ? "" : "Full name is required.");
  }

  function handleEmailChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (emailError) setEmailError(validateEmail(e.target.value));
  }

  function handleEmailBlur(e: React.FocusEvent<HTMLInputElement>) {
    setEmailError(validateEmail(e.target.value));
  }

  function handlePasswordChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setPasswordValue(val);
    setPasswordError(validatePassword(val));
  }

  function handleConfirmChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (confirmError) {
      setConfirmError(
        e.target.value === passwordValue ? "" : "Passwords do not match."
      );
    }
  }

  function handleConfirmBlur(e: React.FocusEvent<HTMLInputElement>) {
    setConfirmError(
      e.target.value === passwordValue ? "" : "Passwords do not match."
    );
  }

  const hasClientError =
    !!fullNameError || !!emailError || !!passwordError || !!confirmError;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-[#1A1A1A] mb-1">
        Create an account
      </h1>
      <p className="text-sm text-[#5A6478] mb-7">
        Fill in the details below to get started.
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
          id="fullName"
          name="fullName"
          type="text"
          label="Full name"
          autoComplete="name"
          required
          error={fullNameError}
          onBlur={handleFullNameBlur}
        />

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
          autoComplete="new-password"
          required
          error={passwordError}
          helperText={!passwordError ? "8 or more characters, including at least one number." : undefined}
          onChange={handlePasswordChange}
        />

        <Input
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          label="Confirm password"
          autoComplete="new-password"
          required
          error={confirmError}
          onChange={handleConfirmChange}
          onBlur={handleConfirmBlur}
        />

        <Button
          type="submit"
          loading={pending}
          disabled={hasClientError}
          className="w-full"
        >
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-[#5A6478]">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-[#1A2B4C]">
          Sign in
        </Link>
      </p>
    </div>
  );
}
