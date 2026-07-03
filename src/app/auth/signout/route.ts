import { NextResponse } from "next/server";
import { DEV_AUTH_COOKIE, isDevTestAuthEnabled } from "@/lib/dev-auth";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const response = NextResponse.redirect(new URL("/login", request.url), 303);

  if (isDevTestAuthEnabled()) {
    response.cookies.set(DEV_AUTH_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 0,
    });
  }

  return response;
}
