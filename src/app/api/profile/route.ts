import { getCurrentUser } from "@/lib/auth";
import { badRequest, forbidden, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { updateStudentProfile } from "@/lib/titles/community-events";

type UpdateProfileBody = {
  displayName?: unknown;
  bio?: unknown;
};

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  if (user.role.name !== "student" || !user.studentProfile) return forbidden();

  let body: UpdateProfileBody;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  if (typeof body.displayName !== "string") {
    return badRequest("displayName is required");
  }

  const displayName = body.displayName.trim();
  if (!displayName || displayName.length > 100) {
    return badRequest("displayName must be between 1 and 100 characters");
  }

  if (body.bio !== null && body.bio !== undefined && typeof body.bio !== "string") {
    return badRequest("bio must be a string or null");
  }

  const normalizedBio = typeof body.bio === "string" ? body.bio.trim() : null;
  if (normalizedBio && normalizedBio.length > 200) {
    return badRequest("bio must be 200 characters or fewer");
  }

  const result = await prisma.$transaction((tx) => updateStudentProfile(
    tx, user.id, displayName, normalizedBio || null, new Date(),
  ), { timeout: 30_000 });

  return Response.json(result);
}
