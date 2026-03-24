import { AuthCallbackHandler } from "@/components/auth/auth-callback-handler";

export default async function AuthCallbackPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#fafaf9,transparent_55%),linear-gradient(180deg,#f4f4f5_0%,#e4e4e7_100%)] px-4 py-12 dark:bg-[radial-gradient(circle_at_top,#27272a,transparent_45%),linear-gradient(180deg,#09090b_0%,#18181b_100%)]">
      <AuthCallbackHandler />
    </main>
  );
}
