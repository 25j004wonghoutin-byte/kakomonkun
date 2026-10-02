import type { Prisma } from "../../../prisma/generated/client";
import { getTokyoDate } from "../tokyo-date";
import type { ActivityInput } from "./contract";
import { lockTitleOwner, syncTitleUnlocks } from "./unlocks";

export type NavigationState = { lastSequence: number; stage: "idle" | "home" | "profile"; roundTrips: number };

export function advanceNavigation(state: NavigationState, visit: { sequence: number; path: string }): NavigationState {
  if (!Number.isSafeInteger(visit.sequence) || visit.sequence <= state.lastSequence) return state;
  // 逆順配送で飛ばされた画面から往復を推定しない。
  let stage = state.lastSequence > 0 && visit.sequence > state.lastSequence + 1 ? "idle" : state.stage;
  let roundTrips = state.roundTrips;
  if (visit.path === "/") {
    if (stage === "profile") roundTrips++;
    stage = "home";
  } else if (visit.path === "/profile") {
    stage = stage === "home" || stage === "profile" ? "profile" : "idle";
  } else stage = "idle";
  return { lastSequence: visit.sequence, stage, roundTrips };
}

export async function recordTitleActivity(tx: Prisma.TransactionClient, userId: string, input: ActivityInput): Promise<void> {
  await lockTitleOwner(tx, userId);
  const user = await tx.user.findUnique({ where: { id: userId }, select: { status: true, deletedAt: true, role: { select: { name: true } } } });
  if (user?.role.name !== "student" || user.status !== "active" || user.deletedAt !== null) return;
  const profile = await tx.studentProfile.findUnique({ where: { userId }, select: { titleTrackingStartedAt: true } });
  if (!profile) return;
  if (profile.titleTrackingStartedAt === null) await tx.studentProfile.update({ where: { userId }, data: { titleTrackingStartedAt: input.now } });
  // 現在日の保存前に、閉じた無回答日・観測開始後の空白を評価する。
  await syncTitleUnlocks(tx, userId, { now: input.now, source: "event" });
  const activityDate = new Date(`${getTokyoDate(input.now)}T00:00:00.000Z`);
  await tx.studentActivityDay.upsert({
    where: { userId_activityDate: { userId, activityDate } },
    create: { userId, activityDate, hasAnswered: input.hasAnswered === true, firstSeenAt: input.now, lastSeenAt: input.now },
    update: { lastSeenAt: input.now, ...(input.hasAnswered === true ? { hasAnswered: true } : {}) },
  });
  if (input.navigation) {
    const key = { userId, tabId: input.navigation.tabId };
    const existing = await tx.studentNavigationProgress.findUnique({ where: { userId_tabId: key } });
    const before: NavigationState = existing ? { lastSequence: existing.lastSequence, stage: existing.stage as NavigationState["stage"], roundTrips: existing.roundTrips } : { lastSequence: 0, stage: "idle", roundTrips: 0 };
    const after = advanceNavigation(before, input.navigation);
    if (after !== before) await tx.studentNavigationProgress.upsert({ where: { userId_tabId: key }, create: { ...key, ...after }, update: after });
  }
  await syncTitleUnlocks(tx, userId, { now: input.now, source: "event" });
}
