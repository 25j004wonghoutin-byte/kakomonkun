import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GOOGLE_DOMAIN_ERROR_CODE, GoogleAccountDomainError } from "@/lib/google-login-policy";

function getSafeNextPath(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") && !/[\\\u0000-\u001f\u007f]/.test(value) ? value : "/";
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = getSafeNextPath(requestUrl.searchParams.get("next"));
  let errorCode = "auth_callback_failed";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        try {
          const { ensureAppUser } = await import("@/lib/auth");
          await ensureAppUser(user);
          return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
        } catch (cause) {
          if (cause instanceof GoogleAccountDomainError) {
            errorCode = GOOGLE_DOMAIN_ERROR_CODE;
          } else {
            console.error("Failed to create or update app user", cause);
          }
        }
      }

      // End only this rejected sign-in; keep other devices' sessions intact.
      try {
        const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
        if (signOutError) console.error("Failed to clear rejected login session");
      } catch {
        console.error("Failed to clear rejected login session");
      }
    }
  }

  const loginUrl = new URL("/login", requestUrl.origin);
  loginUrl.searchParams.set("error", errorCode);
  if (nextPath !== "/") loginUrl.searchParams.set("next", nextPath);
  return NextResponse.redirect(loginUrl);
}
