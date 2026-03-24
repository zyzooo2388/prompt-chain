import type { CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

import {
  getAdminProfileByUserId,
  getUnauthorizedRedirectPath,
  hasAdminAccess,
  type AdminProfile,
} from "@/lib/supabase/auth";
import { createRequestSupabaseServerClient } from "@/lib/supabase/server";

const LOGIN_PATH = "/login";
const AUTHORIZED_REDIRECT_PATH = "/flavors";

type CallbackPayload = {
  redirectTo: string;
  errorCode?: string;
  errorMessage?: string;
  errorDetails?: string | null;
};

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

function logInfo(message: string, metadata?: Record<string, unknown>) {
  console.info("[auth/callback]", message, metadata ?? {});
}

function logError(message: string, metadata?: Record<string, unknown>) {
  console.error("[auth/callback]", message, metadata ?? {});
}

function buildLoginRedirect(errorCode: string): string {
  const loginUrl = new URL(LOGIN_PATH, "http://localhost");
  loginUrl.searchParams.set("error", errorCode);
  return `${loginUrl.pathname}${loginUrl.search}`;
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    };
  }

  return {
    message: String(error),
  };
}

function applyCookies(response: NextResponse, cookiesToSet: CookieToSet[]) {
  for (const { name, value, options } of cookiesToSet) {
    response.cookies.set(name, value, options);
  }

  return response;
}

function buildJsonResponse(
  payload: CallbackPayload,
  status: number,
  cookiesToSet: CookieToSet[],
) {
  return applyCookies(NextResponse.json(payload, { status }), cookiesToSet);
}

function buildErrorResponse(
  errorCode: string,
  errorMessage: string,
  status: number,
  cookiesToSet: CookieToSet[],
  errorDetails?: string | null,
) {
  return buildJsonResponse(
    {
      redirectTo: buildLoginRedirect(errorCode),
      errorCode,
      errorMessage,
      errorDetails: errorDetails ?? null,
    },
    status,
    cookiesToSet,
  );
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const providerError = url.searchParams.get("error");
  const providerErrorDescription = url.searchParams.get("error_description");
  const pendingCookies: CookieToSet[] = [];

  logInfo("Callback URL received", {
    callbackUrl: url.toString(),
    hasCode: Boolean(code),
    providerError: providerError ?? null,
    providerErrorDescription: providerErrorDescription ?? null,
  });

  if (providerError) {
    logError("OAuth provider returned an error", {
      providerError,
      providerErrorDescription: providerErrorDescription ?? null,
      chosenRedirectPath: buildLoginRedirect("oauth_provider_error"),
    });

    return buildErrorResponse(
      "oauth_provider_error",
      "Could not complete sign-in. Redirecting to login...",
      400,
      pendingCookies,
      providerErrorDescription ?? providerError,
    );
  }

  if (!code) {
    logError("No OAuth code found on callback URL", {
      chosenRedirectPath: buildLoginRedirect("missing_code"),
    });

    return buildErrorResponse(
      "missing_code",
      "Missing OAuth code. Redirecting to login...",
      400,
      pendingCookies,
    );
  }

  try {
    const supabase = createRequestSupabaseServerClient(
      () => request.cookies.getAll().map(({ name, value }) => ({ name, value })),
      (cookiesToSet) => {
        pendingCookies.splice(0, pendingCookies.length, ...cookiesToSet);
      },
    );

    const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    logInfo("exchangeCodeForSession completed", {
      exchangeSucceeded: !exchangeError,
      exchangeError: exchangeError ? serializeError(exchangeError) : null,
      hasSession: Boolean(exchangeData?.session),
      hasUserFromExchange: Boolean(exchangeData?.user),
    });

    if (exchangeError) {
      logError("OAuth code exchange failed", {
        exchangeError: serializeError(exchangeError),
        chosenRedirectPath: buildLoginRedirect("oauth_exchange_failed"),
      });

      return buildErrorResponse(
        "oauth_exchange_failed",
        "Could not complete sign-in. Redirecting to login...",
        401,
        pendingCookies,
        exchangeError.message,
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    logInfo("User lookup after exchange completed", {
      userFound: Boolean(user),
      userId: user?.id ?? null,
      userError: userError ? serializeError(userError) : null,
    });

    if (userError || !user) {
      logError("No authenticated user after successful exchange", {
        userError: userError ? serializeError(userError) : null,
        chosenRedirectPath: buildLoginRedirect("no_session"),
      });

      return buildErrorResponse(
        "no_session",
        "No authenticated session was created. Redirecting to login...",
        401,
        pendingCookies,
        userError?.message ?? null,
      );
    }

    const { profile, error: profileError } = await getAdminProfileByUserId(supabase, user.id);

    logInfo("Profile lookup completed", {
      profileFound: Boolean(profile),
      profileFlags: profile
        ? {
            is_superadmin: Boolean(profile.is_superadmin),
            is_matrix_admin: Boolean(profile.is_matrix_admin),
          }
        : null,
      profileError: profileError ? serializeError(profileError) : null,
    });

    if (profileError) {
      logError("Profile lookup failed", {
        userId: user.id,
        profileError: serializeError(profileError),
        chosenRedirectPath: buildLoginRedirect("profile_lookup_failed"),
      });

      return buildErrorResponse(
        "profile_lookup_failed",
        "Could not verify profile access. Redirecting to login...",
        500,
        pendingCookies,
        profileError.message,
      );
    }

    if (!profile) {
      const redirectTo = getUnauthorizedRedirectPath("missing_profile");

      logInfo("Authorization denied due to missing profile row", {
        userId: user.id,
        profileFound: false,
        chosenRedirectPath: redirectTo,
      });

      return buildJsonResponse({ redirectTo }, 200, pendingCookies);
    }

    const isAuthorized = hasAdminAccess(profile as AdminProfile);

    if (!isAuthorized) {
      const redirectTo = getUnauthorizedRedirectPath("not_admin");

      logInfo("Authorization denied due to profile flags", {
        userId: user.id,
        profileFound: true,
        profileFlags: {
          is_superadmin: Boolean(profile.is_superadmin),
          is_matrix_admin: Boolean(profile.is_matrix_admin),
        },
        chosenRedirectPath: redirectTo,
      });

      return buildJsonResponse({ redirectTo }, 200, pendingCookies);
    }

    logInfo("Authorization granted", {
      userId: user.id,
      profileFlags: {
        is_superadmin: Boolean(profile.is_superadmin),
        is_matrix_admin: Boolean(profile.is_matrix_admin),
      },
      chosenRedirectPath: AUTHORIZED_REDIRECT_PATH,
    });

    return buildJsonResponse({ redirectTo: AUTHORIZED_REDIRECT_PATH }, 200, pendingCookies);
  } catch (error) {
    logError("Unhandled callback exception", {
      error: serializeError(error),
      chosenRedirectPath: buildLoginRedirect("oauth_callback_unhandled"),
    });

    return buildErrorResponse(
      "oauth_callback_unhandled",
      "Unexpected callback error. Redirecting to login...",
      500,
      pendingCookies,
      error instanceof Error ? error.message : String(error),
    );
  }
}
