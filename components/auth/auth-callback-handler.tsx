'use client';

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type CallbackResponse = {
  redirectTo: string;
  errorCode?: string;
  errorMessage?: string;
  errorDetails?: string | null;
};

const CALLBACK_TIMEOUT_MS = 12000;
const ERROR_REDIRECT_DELAY_MS = 1500;
const LOGIN_FALLBACK_PATH = "/login?error=oauth_callback_timeout";
const LOGIN_EXCEPTION_PATH = "/login?error=oauth_callback_client_error";
const IS_DEV = process.env.NODE_ENV !== "production";

function formatDevError(payload: CallbackResponse | null) {
  if (!IS_DEV || !payload?.errorCode) {
    return null;
  }

  return [payload.errorCode, payload.errorDetails].filter(Boolean).join(": ");
}

export function AuthCallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [debugError, setDebugError] = useState<string | null>(null);
  const searchParamsString = searchParams.toString();

  useEffect(() => {
    let isActive = true;
    const abortController = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (!isActive) {
        return;
      }

      setError("Sign-in is taking longer than expected. Redirecting to login...");
      setDebugError(IS_DEV ? "oauth_callback_timeout" : null);
      router.replace(LOGIN_FALLBACK_PATH);
      router.refresh();
    }, CALLBACK_TIMEOUT_MS);

    async function finalizeOAuthSession() {
      try {
        const callbackResponse = await fetch(
          `/api/auth/callback${searchParamsString ? `?${searchParamsString}` : ""}`,
          {
            method: "GET",
            cache: "no-store",
            signal: abortController.signal,
          },
        );

        let payload: CallbackResponse | null = null;
        try {
          payload = (await callbackResponse.json()) as CallbackResponse;
        } catch {
          payload = null;
        }

        if (!isActive) {
          return;
        }

        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        if (!callbackResponse.ok) {
          setError(payload?.errorMessage ?? "Could not complete sign-in. Redirecting to login...");
          setDebugError(formatDevError(payload));
          setTimeout(() => {
            router.replace(payload?.redirectTo ?? LOGIN_EXCEPTION_PATH);
            router.refresh();
          }, ERROR_REDIRECT_DELAY_MS);
          return;
        }

        if (payload?.errorMessage) {
          setError(payload.errorMessage);
          setDebugError(formatDevError(payload));
        }

        router.replace(payload?.redirectTo ?? LOGIN_EXCEPTION_PATH);
        router.refresh();
      } catch (error) {
        if (!isActive) {
          return;
        }

        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setError("Unexpected callback error. Redirecting to login...");
        setDebugError(IS_DEV ? (error instanceof Error ? error.message : String(error)) : null);
        setTimeout(() => {
          router.replace(LOGIN_EXCEPTION_PATH);
          router.refresh();
        }, ERROR_REDIRECT_DELAY_MS);
      }
    }

    void finalizeOAuthSession();

    return () => {
      isActive = false;
      abortController.abort();
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [router, searchParamsString]);

  return (
    <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white/90 p-8 shadow-xl shadow-zinc-300/30 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80 dark:shadow-black/30">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500 dark:text-zinc-400">
        Prompt Chain Tool
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        Finishing sign-in
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Completing your Google login and checking your access to the dashboard.
      </p>

      {error ? (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
          {error}
          {debugError ? (
            <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-300">{debugError}</p>
          ) : null}
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          Redirecting...
        </div>
      )}
    </div>
  );
}
