import type { PrismaClient } from "../../prisma/generated/client";
import { displayNameForRole } from "@/lib/teacher/identity";

export type MeActor = {
  id: string;
  displayName: string;
  role: { name: string };
  studentProfile: {
    totalPoints: number;
    avatarUrl: string | null;
    totalPracticeCount: number;
    totalCorrectCount: number;
    totalAnswerCount: number;
  } | null;
};

export type StudentIdentity = { id: string; displayName: string; avatarUrl: string | null; titleName?: string | null };

export function getStudentIdentity(user: MeActor): StudentIdentity {
  return {
    id: user.id,
    displayName: displayNameForRole(user.role.name, user.displayName),
    avatarUrl: user.role.name === "student" ? user.studentProfile?.avatarUrl ?? null : null,
  };
}

export type MePayload = {
  id: string;
  displayName: string;
  role: string;
  profile: (NonNullable<MeActor["studentProfile"]> & { ownedTitleCount: number; currentTitleName?: string | null }) | null;
};

export function getOwnedTitleCount(db: Pick<PrismaClient, "userTitle">, userId: string): Promise<number> {
  return db.userTitle.count({ where: { userId, title: { isActive: true } } });
}

const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };

export function createMeHandler(deps: {
  getUser(): Promise<MeActor | null>;
  countOwnedTitles(userId: string): Promise<number>;
  getCurrentTitleName?(userId: string): Promise<string | null>;
}) {
  return async function GET(): Promise<Response> {
    const user = await deps.getUser();
    if (!user) return Response.json({ error: "ログインしてください。" }, { status: 401, headers });

    const [ownedTitleCount, currentTitleName] = user.role.name === "student" && user.studentProfile
      ? await Promise.all([deps.countOwnedTitles(user.id), deps.getCurrentTitleName?.(user.id)])
      : [0, undefined];
    const profile = user.role.name === "student" && user.studentProfile
      ? {
          totalPoints: user.studentProfile.totalPoints,
          avatarUrl: user.studentProfile.avatarUrl,
          totalPracticeCount: user.studentProfile.totalPracticeCount,
          totalCorrectCount: user.studentProfile.totalCorrectCount,
          totalAnswerCount: user.studentProfile.totalAnswerCount,
          ownedTitleCount,
          ...(deps.getCurrentTitleName ? { currentTitleName: currentTitleName ?? null } : {}),
        }
      : null;
    const payload: MePayload = {
      id: user.id,
      displayName: displayNameForRole(user.role.name, user.displayName),
      role: user.role.name,
      profile,
    };
    return Response.json(payload, { headers });
  };
}
