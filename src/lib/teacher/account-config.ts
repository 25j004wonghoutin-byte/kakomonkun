import "server-only";

import fs from "node:fs";
import path from "node:path";
import { normalizeTeacherAccountName } from "@/lib/teacher/identity";

const LOCAL_TEACHER_ENV_FILE = ".env.teacher.local";

export function getConfiguredTeacherAccountName() {
  const configuredByEnvironment = normalizeTeacherAccountName(
    process.env.TEACHER_ACCOUNT_NAME ?? "",
  );
  if (configuredByEnvironment) return configuredByEnvironment;

  if (process.env.NODE_ENV === "production") return null;

  const localValues = readEnvironmentFile(
    path.resolve(process.cwd(), LOCAL_TEACHER_ENV_FILE),
  );

  return normalizeTeacherAccountName(localValues.TEACHER_ACCOUNT_NAME ?? "");
}

function readEnvironmentFile(filePath: string) {
  if (!fs.existsSync(filePath)) return {} as Record<string, string>;

  const values: Record<string, string> = {};
  const source = fs.readFileSync(filePath, "utf8");

  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator <= 0) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}
