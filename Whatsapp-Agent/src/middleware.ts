import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Do not run middleware on API routes (webhook, etc) or static files
  if (
    request.nextUrl.pathname.startsWith("/api") ||
    request.nextUrl.pathname.startsWith("/_next") ||
    request.nextUrl.pathname.includes(".")
  ) {
    return supabaseResponse;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  const isPublicRoute = pathname === "/home" || pathname === "/login";

  // If user is NOT logged in and trying to access a protected route, redirect
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    // If they hit the root dashboard without logging in, send them to the landing page
    if (pathname === "/") {
      url.pathname = "/home";
    } else {
      url.pathname = "/login";
    }
    return NextResponse.redirect(url);
  }

  // If user IS logged in and tries to access login or landing page, redirect to dashboard
  if (user && (pathname === "/login" || pathname === "/home")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // If user IS logged in but has no business linked, redirect to /onboard
  // (skip if they are already on /onboard to avoid a redirect loop)
  if (user && pathname !== "/onboard" && pathname !== "/login") {
    // Check if the user has a profile+business linked using service role
    // We do a lightweight check via the Supabase client (anon key is fine — RLS
    // will filter to the user's own row since auth.uid() matches the profile.id)
    const { data: profile } = await supabase
      .from("profiles")
      .select("business_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || !profile.business_id) {
      // Allow access to /privacy and /terms even without a business
      if (!pathname.startsWith("/privacy") && !pathname.startsWith("/terms")) {
        const url = request.nextUrl.clone();
        url.pathname = "/onboard";
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
