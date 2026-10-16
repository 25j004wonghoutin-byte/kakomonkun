import { avatarHandlers } from "@/lib/avatars/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = avatarHandlers.post;
export const DELETE = avatarHandlers.remove;
