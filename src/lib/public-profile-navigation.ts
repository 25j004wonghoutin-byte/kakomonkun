import { isUuid } from "./board/validation";

export type ProfileReturnTarget = { href: string; label: string };
const boardTarget: ProfileReturnTarget = { href: "/board", label: "掲示板へ戻る" };

export function getProfileReturnTarget(value: unknown): ProfileReturnTarget {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\s#]/.test(value)) return { ...boardTarget };
  const [path, query = ""] = value.split("?");
  if (path === "/board" && !query) return { ...boardTarget };
  if (path.startsWith("/board/posts/") && !query && isUuid(path.slice("/board/posts/".length))) return { href: path, label: "投稿へ戻る" };
  if (path !== "/ranking") return { ...boardTarget };
  const params = new URLSearchParams(query);
  if (params.getAll("examCode").length > 1 || params.getAll("month").length > 1) return { ...boardTarget };
  const examCode = params.get("examCode"), month = params.get("month");
  if (examCode !== null && examCode !== "it_passport" && examCode !== "fe") return { ...boardTarget };
  if (month !== null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { ...boardTarget };
  const clean = new URLSearchParams();
  if (examCode) clean.set("examCode", examCode);
  if (month) clean.set("month", month);
  return { href: "/ranking" + (clean.size ? "?" + clean : ""), label: "ランキングへ戻る" };
}

export function getPublicProfileHref(userId: string, returnTo = "/board"): string {
  return `/users/${encodeURIComponent(userId)}?returnTo=${encodeURIComponent(getProfileReturnTarget(returnTo).href)}`;
}
