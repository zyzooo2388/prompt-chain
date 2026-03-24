'use client';

import { useState } from "react";

import { supabase } from "@/lib/supabase/client";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleGoogleSignIn() {
    setIsLoading(true);
    setError(null);

    try {
      const isLocalhost =
        window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      const redirectTo = isLocalhost
        ? "http://localhost:3000/auth/callback"
        : new URL("/auth/callback", window.location.origin).toString();

      console.info("[auth/login] Starting Google OAuth", { redirectTo, isLocalhost });
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
        },
      });

      if (signInError) {
        throw signInError;
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Sign in failed.");
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={isLoading}
        className="flex w-full items-center justify-center rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-300"
      >
        {isLoading ? "Redirecting to Google..." : "Continue with Google"}
      </button>

      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
        Sign in with your Google account to continue to the admin tool.
      </p>
    </div>
  );
}
