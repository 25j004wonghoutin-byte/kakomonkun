import { avatarHandlers } from "@/lib/avatars/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {params: Promise<{userId: string; version: string}>};

export async function GET(request: Request, context: Context) {
  return avatarHandlers.image(request, await context.params);
}

export async function HEAD(request: Request, context: Context) {
  return avatarHandlers.image(request, await context.params);
}
