export const DEV_AUTH_COOKIE = "kakomonkun_dev_user_id";

export function isDevTestAuthEnabled() {
  return process.env.NODE_ENV !== "production";
}
