import { getCurrentUser } from "@/lib/auth";
import { badRequest, forbidden, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { recordTitleActivity } from "@/lib/titles/activity";
import { getTokyoDate } from "@/lib/tokyo-date";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (user.role.name !== "student" || !user.studentProfile) return forbidden();
  let body: { navigation?: { tabId?: unknown; sequence?: unknown; path?: unknown } };
  try { body = await request.json(); } catch { return badRequest("Invalid JSON body"); }
  if (!body || typeof body !== "object") return badRequest("Invalid activity body");
  const value = body.navigation;
  let navigation: { tabId: string; sequence: number; path: string } | undefined;
  if (value !== undefined) {
    if (!value || typeof value.tabId !== "string" || !value.tabId || value.tabId.length > 100 || typeof value.sequence !== "number" || !Number.isInteger(value.sequence) || value.sequence < 1 || value.sequence > 2147483647 || typeof value.path !== "string" || !value.path.startsWith("/") || value.path.length > 512) return badRequest("Invalid navigation event");
    navigation = { tabId: value.tabId, sequence: value.sequence, path: value.path };
  }
  const now = new Date();
  await prisma.$transaction((tx) => recordTitleActivity(tx, user.id, { now, navigation }), { timeout: 30_000 });
  return Response.json({ date: getTokyoDate(now) });
}
