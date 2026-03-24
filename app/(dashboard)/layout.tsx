import { ReactNode } from "react";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/dashboard/page-header";
import { getAdminAccessResult, getUnauthorizedRedirectPath } from "@/lib/supabase/auth";

export const dynamic = "force-dynamic";

type DashboardLayoutProps = {
  children: ReactNode;
};

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const access = await getAdminAccessResult();

  if (access.error) {
    throw new Error(access.error.message);
  }

  if (!access.user) {
    redirect("/login");
  }

  if (!access.isAllowed) {
    redirect(getUnauthorizedRedirectPath(access.denialReason === "missing_profile" ? "missing_profile" : "not_admin"));
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-100 to-zinc-200 px-4 py-8 text-zinc-950 transition-colors duration-200 dark:from-zinc-950 dark:to-zinc-900 dark:text-zinc-50">
      <div className="mx-auto w-full max-w-7xl">
        <PageHeader userEmail={access.user.email} />
        {children}
      </div>
    </main>
  );
}
