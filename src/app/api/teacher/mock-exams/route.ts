import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createTeacherMockHandler, getTeacherMockExams } from "@/lib/teacher/mock-exams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = createTeacherMockHandler({
  getUser: async () => {
    const user = await getCurrentUser();
    return user ? { id: user.id, roleName: user.role.name, status: user.status, deletedAt: user.deletedAt } : null;
  },
  read: (actor, input) => getTeacherMockExams(prisma, actor, input),
});
