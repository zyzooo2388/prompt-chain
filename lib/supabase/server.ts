import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient, type User } from "@supabase/supabase-js";

import { getSupabaseCookieOptions, getSupabaseServerConfig } from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/types";

export function createServerSupabaseClient(accessToken?: string) {
  const { url, anonKey } = getSupabaseServerConfig();

  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : undefined,
  });
}

type CookieSetter = (cookiesToSet: { name: string; value: string; options: CookieOptions }[]) => void;

type CookieGetter = () => { name: string; value: string }[];

function getSupabaseSsrClientOptions(cookieGetter: CookieGetter, cookieSetter?: CookieSetter) {
  return {
    auth: {
      flowType: "pkce" as const,
    },
    cookieOptions: getSupabaseCookieOptions(),
    cookies: {
      getAll() {
        return cookieGetter();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookieSetter?.(cookiesToSet);
      },
    },
  };
}

export function createRequestSupabaseServerClient(
  cookieGetter: CookieGetter,
  cookieSetter?: CookieSetter,
) {
  const { url, anonKey } = getSupabaseServerConfig();

  return createServerClient<Database>(
    url,
    anonKey,
    getSupabaseSsrClientOptions(cookieGetter, cookieSetter),
  );
}

export async function createAppRouterServerSupabaseClient() {
  const cookieStore = await cookies();

  return createRequestSupabaseServerClient(
    () => cookieStore.getAll().map(({ name, value }) => ({ name, value })),
    (cookiesToSet) => {
      try {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      } catch {
        // Server components can read cookies but may not always be allowed to mutate them.
      }
    },
  );
}

export async function getServerUser(): Promise<User | null> {
  const supabase = await createAppRouterServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    return null;
  }

  return user;
}
