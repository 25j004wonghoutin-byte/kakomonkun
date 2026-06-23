import type { User as SupabaseUser } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

const STUDENT_ROLE = "student";

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
          displayName,
          lastLoginAt: new Date(),
        },
        include: { role: true, studentProfile: true },
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
        include: { role: true, studentProfile: true },
      });
    }

    if (user.role.name === STUDENT_ROLE && !user.studentProfile) {
      await tx.studentProfile.create({
        data: { userId: user.id },
      });
    }

    return tx.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { role: true, studentProfile: true },
    });
  });
}

export async function getCurrentUser() {
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
    include: { role: true, studentProfile: true },
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

  return user;
}
