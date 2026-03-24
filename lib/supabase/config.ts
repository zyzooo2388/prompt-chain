const SUPABASE_URL_ENV = "NEXT_PUBLIC_SUPABASE_URL";
const SUPABASE_ANON_KEY_ENV = "NEXT_PUBLIC_SUPABASE_ANON_KEY";
const SUPABASE_AUTH_COOKIE_NAME = "prompt-chain-auth";

export type SupabaseServerConfig = {
  url: string;
  anonKey: string;
};

export function getSupabaseServerConfig(): SupabaseServerConfig {
  const url = process.env[SUPABASE_URL_ENV];
  const anonKey = process.env[SUPABASE_ANON_KEY_ENV];

  if (!url || !anonKey) {
    throw new Error(
      `Missing Supabase server config. Set ${SUPABASE_URL_ENV} and ${SUPABASE_ANON_KEY_ENV}.`,
    );
  }

  return { url, anonKey };
}

export function getSupabaseCookieOptions() {
  return {
    name: SUPABASE_AUTH_COOKIE_NAME,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}
