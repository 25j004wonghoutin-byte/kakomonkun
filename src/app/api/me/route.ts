import { getCurrentUser } from "@/lib/auth";
import { unauthorized } from "@/lib/http";
import { displayNameForRole } from "@/lib/teacher/identity";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return unauthorized();
  }

  return Response.json({
    id: user.id,
    displayName: displayNameForRole(user.role.name, user.displayName),
    role: user.role.name,
    profile: user.studentProfile
      ? {
          totalPoints: user.studentProfile.totalPoints,
          avatarUrl: user.studentProfile.avatarUrl,
          totalPracticeCount: user.studentProfile.totalPracticeCount,
          totalCorrectCount: user.studentProfile.totalCorrectCount,
          totalAnswerCount: user.studentProfile.totalAnswerCount,
        }
      : null,
  }, { headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" } });
}
