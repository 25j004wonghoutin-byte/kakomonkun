import { getCurrentUser } from "@/lib/auth";
import { unauthorized } from "@/lib/http";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return unauthorized();
  }

  return Response.json({
    id: user.id,
    displayName: user.displayName,
    role: user.role.name,
    profile: user.studentProfile
      ? {
          totalPoints: user.studentProfile.totalPoints,
          totalPracticeCount: user.studentProfile.totalPracticeCount,
          totalCorrectCount: user.studentProfile.totalCorrectCount,
          totalAnswerCount: user.studentProfile.totalAnswerCount,
        }
      : null,
  });
}
