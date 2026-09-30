export const TEACHER_DISPLAY_NAME = "管理者";

export function isTeacherRole(roleName: string) {
  return roleName === "teacher";
}

export function displayNameForRole(roleName: string, storedName: string) {
  return isTeacherRole(roleName) ? TEACHER_DISPLAY_NAME : storedName;
}

const TEACHER_ACCOUNT_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,49}$/u;

export function normalizeTeacherAccountName(account: string) {
  const normalized = account.trim().toLowerCase();

  return TEACHER_ACCOUNT_NAME_PATTERN.test(normalized) ? normalized : null;
}

export function teacherAuthEmailForAccount(account: string) {
  const normalized = normalizeTeacherAccountName(account);

  return normalized ? `${normalized}@teacher.local` : null;
}

export function isTeacherSessionPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  return (value as Record<string, unknown>).role === "teacher";
}
