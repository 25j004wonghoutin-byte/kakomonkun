import { prisma } from "@/lib/prisma";

const DEMO_STUDENT_EMAIL = "student@example.com";

export async function getCurrentUser(request: Request) {
  const requestedUserId = request.headers.get("x-user-id");

  const user = requestedUserId
    ? await prisma.user.findUnique({
        where: { id: requestedUserId },
        include: { role: true, studentProfile: true },
      })
    : await prisma.user.findUnique({
        where: { email: DEMO_STUDENT_EMAIL },
        include: { role: true, studentProfile: true },
      });

  if (!user || user.status !== "active") {
    return null;
  }

  return user;
}
