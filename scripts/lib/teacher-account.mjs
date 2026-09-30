const TEACHER_ACCOUNT_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,49}$/u;

export function normalizeTeacherAccountName(account) {
  if (typeof account !== "string") return null;

  const normalized = account.trim().toLowerCase();
  return TEACHER_ACCOUNT_NAME_PATTERN.test(normalized) ? normalized : null;
}

export function teacherAuthEmailForAccount(account) {
  const normalized = normalizeTeacherAccountName(account);
  return normalized ? `${normalized}@teacher.local` : null;
}

export function parseTeacherAccountConfig(source) {
  const name = normalizeTeacherAccountName(source.TEACHER_ACCOUNT_NAME ?? "");
  if (!name) {
    throw new Error(
      "TEACHER_ACCOUNT_NAME must be 3-50 ASCII characters using letters, numbers, dot, underscore, or hyphen",
    );
  }

  const password = source.TEACHER_ACCOUNT_PASSWORD;
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("TEACHER_ACCOUNT_PASSWORD must be at least 8 characters");
  }

  return {
    name,
    password,
    email: `${name}@teacher.local`,
  };
}
