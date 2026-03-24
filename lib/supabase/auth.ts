import type { PostgrestError, SupabaseClient, User } from "@supabase/supabase-js";

import type { ProfileRow } from "@/lib/supabase/types";
import { createAppRouterServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type AdminProfile = Pick<ProfileRow, "id" | "is_superadmin" | "is_matrix_admin">;
export type AdminDenialReason = "no_session" | "missing_profile" | "not_admin";
export type AdminAccessResult = {
  user: User | null;
  profile: AdminProfile | null;
  isAllowed: boolean;
  denialReason: AdminDenialReason | null;
  error: PostgrestError | null;
};

const ADMIN_ONLY_PREFIXES = ["/flavors"];

export function isAdminPath(pathname: string): boolean {
  return ADMIN_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function hasAdminAccess(profile: AdminProfile | null | undefined): boolean {
  if (!profile) {
    return false;
  }

  const isSuperAdmin = Boolean(profile.is_superadmin);
  const isMatrixAdmin = Boolean(profile.is_matrix_admin);

  return isSuperAdmin || isMatrixAdmin;
}

export function getAdminDeniedRedirectPath(): string {
  return "/unauthorized";
}

export function getUnauthorizedRedirectPath(reason: Exclude<AdminDenialReason, "no_session">): string {
  const redirectUrl = new URL("/unauthorized", "http://localhost");
  redirectUrl.searchParams.set("reason", reason);
  return `${redirectUrl.pathname}${redirectUrl.search}`;
}

export async function getAdminProfileByUserId(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ profile: AdminProfile | null; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, is_superadmin, is_matrix_admin")
    .eq("id", userId)
    .maybeSingle();

  return {
    profile: data ?? null,
    error,
  };
}

export async function getAdminAccessResult(): Promise<AdminAccessResult> {
  const supabase = await createAppRouterServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      user: null,
      profile: null,
      isAllowed: false,
      denialReason: "no_session",
      error: null,
    };
  }

  const { profile, error } = await getAdminProfileByUserId(supabase, user.id);
  if (error) {
    return {
      user,
      profile: null,
      isAllowed: false,
      denialReason: null,
      error,
    };
  }

  if (!profile) {
    return {
      user,
      profile: null,
      isAllowed: false,
      denialReason: "missing_profile",
      error: null,
    };
  }

  const isAllowed = hasAdminAccess(profile);

  return {
    user,
    profile,
    isAllowed,
    denialReason: isAllowed ? null : "not_admin",
    error: null,
  };
}
