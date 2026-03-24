import { redirect } from "next/navigation";

type AccessDeniedPageProps = {
  searchParams?: Promise<{ reason?: string }>;
};

export default async function AccessDeniedPage({ searchParams }: AccessDeniedPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const redirectTo = new URL("/unauthorized", "http://localhost");

  if (resolvedSearchParams.reason) {
    redirectTo.searchParams.set("reason", resolvedSearchParams.reason);
  }

  redirect(`${redirectTo.pathname}${redirectTo.search}`);
}
