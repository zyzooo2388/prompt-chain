import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { getAdminAccessResult, getUnauthorizedRedirectPath } from "@/lib/supabase/auth";

export default async function LoginPage() {
  const access = await getAdminAccessResult();

  if (access.error) {
    throw new Error(access.error.message);
  }

  if (access.user && access.isAllowed) {
    redirect("/flavors");
  }

  if (access.user) {
    redirect(getUnauthorizedRedirectPath(access.denialReason === "missing_profile" ? "missing_profile" : "not_admin"));
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#fafaf9,transparent_55%),linear-gradient(180deg,#f4f4f5_0%,#e4e4e7_100%)] px-4 py-12 dark:bg-[radial-gradient(circle_at_top,#27272a,transparent_45%),linear-gradient(180deg,#09090b_0%,#18181b_100%)]">
      <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white/90 p-8 shadow-xl shadow-zinc-300/30 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80 dark:shadow-black/30">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500 dark:text-zinc-400">
            Prompt Chain Tool
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Continue with Google
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Sign in with Google to access the flavor dashboard. Only superadmins and matrix admins can use this tool.
          </p>
        </div>

        <LoginForm />
      </div>
    </main>
  );
}
