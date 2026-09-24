import type { User as SupabaseUser } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { DEV_AUTH_COOKIE, isDevTestAuthEnabled } from "@/lib/dev-auth";
import { prisma } from "@/lib/prisma";
import { ensureStarterTitleForStudent } from "@/lib/starter-title";
import { createClient } from "@/lib/supabase/server";
import {
  displayNameForRole,
  isTeacherRole,
} from "@/lib/teacher/identity";

const STUDENT_ROLE = "student";
const USER_WITH_PROFILES = {
  role: true,
  studentProfile: true,
  teacherProfile: true,
} as const;

function withRoleDisplayName<
  T extends { displayName: string; role: { name: string } },
>(user: T): T {
  return {
    ...user,
    displayName: displayNameForRole(user.role.name, user.displayName),
  };
}

function getDisplayName(user: SupabaseUser) {
  const metadata = user.user_metadata;
  const candidate = metadata.full_name ?? metadata.name ?? metadata.display_name;

  if (typeof candidate === "string" && candidate.trim()) {
    return candidate.trim().slice(0, 100);
  }

  return (user.email?.split("@")[0] || "学生").slice(0, 100);
}

export async function ensureAppUser(authUser: SupabaseUser) {
  if (!authUser.email) {
    throw new Error("Google account did not provide an email address");
  }

  const email = authUser.email.toLowerCase();
  const displayName = getDisplayName(authUser);

  return prisma.$transaction(async (tx) => {
    const [existingByAuthId, existingByEmail] = await Promise.all([
      tx.user.findUnique({ where: { authUserId: authUser.id } }),
      tx.user.findUnique({ where: { email } }),
    ]);

    if (
      existingByAuthId &&
      existingByEmail &&
      existingByAuthId.id !== existingByEmail.id
    ) {
      throw new Error("This Google account conflicts with an existing user");
    }

    const existing = existingByAuthId ?? existingByEmail;
    if (
      existing?.authUserId &&
      existing.authUserId !== authUser.id
    ) {
      throw new Error("This email is already linked to another account");
    }

    let user;

    if (existing) {
      user = await tx.user.update({
        where: { id: existing.id },
        data: {
          authUserId: authUser.id,
          email,
          lastLoginAt: new Date(),
        },
        include: USER_WITH_PROFILES,
      });
    } else {
      const studentRole = await tx.role.findUnique({
        where: { name: STUDENT_ROLE },
      });

      if (!studentRole) {
        throw new Error("Student role is not configured");
      }

      user = await tx.user.create({
        data: {
          authUserId: authUser.id,
          roleId: studentRole.id,
          email,
          displayName,
          lastLoginAt: new Date(),
        },
        include: USER_WITH_PROFILES,
      });
    }

    if (user.role.name === STUDENT_ROLE && !user.studentProfile) {
      await tx.studentProfile.create({
        data: { userId: user.id },
      });
    }

    if (isTeacherRole(user.role.name) && !user.teacherProfile) {
      await tx.teacherProfile.create({
        data: { userId: user.id },
      });
    }

    if (user.role.name === STUDENT_ROLE) {
      await ensureStarterTitleForStudent(tx, user.id);
    }

    const completeUser = await tx.user.findUniqueOrThrow({
      where: { id: user.id },
      include: USER_WITH_PROFILES,
    });

    return withRoleDisplayName(completeUser);
  });
}

async function ensureStudentProfileForUser(userId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.studentProfile.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    await ensureStarterTitleForStudent(tx, userId);

    const completeUser = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      include: USER_WITH_PROFILES,
    });

    return withRoleDisplayName(completeUser);
  });
}

async function ensureTeacherProfileForUser(userId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.teacherProfile.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });

    const completeUser = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      include: USER_WITH_PROFILES,
    });

    return withRoleDisplayName(completeUser);
  });
}

export async function getCurrentUser() {
  if (isDevTestAuthEnabled()) {
    const cookieStore = await cookies();
    const devUserId = cookieStore.get(DEV_AUTH_COOKIE)?.value;

    if (devUserId) {
      const devUser = await prisma.user.findUnique({
        where: { id: devUserId },
        include: USER_WITH_PROFILES,
      });

      if (devUser && devUser.status === "active" && !devUser.deletedAt) {
        if (
          devUser.role.name === STUDENT_ROLE &&
          (!devUser.studentProfile || !devUser.studentProfile.currentTitleId)
        ) {
          return ensureStudentProfileForUser(devUser.id);
        }

        if (isTeacherRole(devUser.role.name) && !devUser.teacherProfile) {
          return ensureTeacherProfileForUser(devUser.id);
        }

        return withRoleDisplayName(devUser);
      }
    }
  }

  const supabase = await createClient();
  const {
    data: { user: authUser },
    error,
  } = await supabase.auth.getUser();

  if (error || !authUser) {
    return null;
  }

  let user = await prisma.user.findUnique({
    where: { authUserId: authUser.id },
    include: USER_WITH_PROFILES,
  });

  if (!user) {
    try {
      user = await ensureAppUser(authUser);
    } catch (cause) {
      console.error("Failed to provision authenticated user", cause);
      return null;
    }
  }

  if (!user || user.status !== "active" || user.deletedAt) return null;

  if (
    user.role.name === STUDENT_ROLE &&
    (!user.studentProfile || !user.studentProfile.currentTitleId)
  ) {
    user = await ensureStudentProfileForUser(user.id);
  }

  if (isTeacherRole(user.role.name) && !user.teacherProfile) {
    user = await ensureTeacherProfileForUser(user.id);
  }

  return withRoleDisplayName(user);
}
