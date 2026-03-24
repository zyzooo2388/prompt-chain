import { SignOutButton } from "@/components/auth/sign-out-button";
import { ThemeToggle } from "@/components/dashboard/theme-toggle";

type PageHeaderProps = {
  userEmail?: string | null;
};

export function PageHeader({ userEmail }: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white/80 p-5 shadow-sm backdrop-blur-sm transition-colors duration-200 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:bg-zinc-900/70">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-950 transition-colors duration-200 dark:text-zinc-50">
          Prompt Chain Tool
        </h1>
        <p className="mt-1 text-sm text-zinc-600 transition-colors duration-200 dark:text-zinc-400">
          Admin dashboard for humor flavors and flavor steps.
        </p>
        {userEmail ? (
          <p className="mt-2 text-xs font-medium uppercase tracking-wide text-zinc-500 transition-colors duration-200 dark:text-zinc-500">
            Signed in as {userEmail}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-3 self-start sm:self-auto">
        <ThemeToggle />
        <SignOutButton />
      </div>
    </header>
  );
}
