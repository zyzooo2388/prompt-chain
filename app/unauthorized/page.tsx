import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { getAdminAccessResult } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

type UnauthorizedPageProps = {
  searchParams?: Promise<{ reason?: string }>;
};

function getUnauthorizedMessage(reason: string | undefined) {
  if (reason === "missing_profile") {
    return "Your account is signed in, but no matching profile row was found for dashboard access.";
  }

  if (reason === "not_admin") {
    return "Your account is signed in, but it is not marked as a superadmin or matrix admin.";
  }

  return "Your account is signed in, but it does not have access to this tool.";
}

export default async function UnauthorizedPage({ searchParams }: UnauthorizedPageProps) {
  const access = await getAdminAccessResult();
  const resolvedSearchParams = (await searchParams) ?? {};

  if (access.error) {
    throw new Error(access.error.message);
  }

  if (!access.user) {
    redirect("/login");
  }

  if (access.isAllowed) {
    redirect("/flavors");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-zinc-100 to-zinc-200 px-4 py-12 dark:from-zinc-950 dark:to-zinc-900">
      <div className="w-full max-w-lg rounded-3xl border border-zinc-200 bg-white/90 p-8 shadow-xl shadow-zinc-300/30 dark:border-zinc-800 dark:bg-zinc-950/80 dark:shadow-black/30">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500 dark:text-zinc-400">
          Prompt Chain Tool
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Unauthorized
        </h1>
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">
          {getUnauthorizedMessage(resolvedSearchParams.reason)}
        </p>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Signed in as {access.user.email ?? "an authenticated user"}.
        </p>

        <div className="mt-8">
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
