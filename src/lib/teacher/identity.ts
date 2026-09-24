export const TEACHER_DISPLAY_NAME = "管理者";

export function isTeacherRole(roleName: string) {
  return roleName === "teacher";
}

export function displayNameForRole(roleName: string, storedName: string) {
  return isTeacherRole(roleName) ? TEACHER_DISPLAY_NAME : storedName;
}

export function normalizeDevTeacherAccount(account: string) {
  return account.trim().toLowerCase() === "test-teacher"
    ? "test-teacher@test.local"
    : null;
}

export function isTeacherSessionPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  return (value as Record<string, unknown>).role === "teacher";
}
