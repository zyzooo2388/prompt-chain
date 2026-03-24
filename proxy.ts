import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isAdminPath } from "@/lib/supabase/auth";
import { createRequestSupabaseServerClient } from "@/lib/supabase/server";

export async function proxy(request: NextRequest) {
  if (!isAdminPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const supabase = createRequestSupabaseServerClient(
    () => request.cookies.getAll().map(({ name, value }) => ({ name, value })),
    (cookiesToSet) => {
      for (const { name, value, options } of cookiesToSet) {
        response.cookies.set(name, value, options);
      }
    },
  );
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    const loginUrl = new URL("/login", request.url);
    const nextPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    loginUrl.searchParams.set("next", nextPath);

    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/flavors/:path*"],
};
