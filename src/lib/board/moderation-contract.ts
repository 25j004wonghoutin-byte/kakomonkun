export const BOARD_REPORT_REASONS = [
  { value: "harassment", label: "嫌がらせ・誹謗中傷" },
  { value: "personal_information", label: "個人情報の公開" },
  { value: "spam", label: "スパム・宣伝" },
  { value: "other", label: "その他の不適切な内容" },
] as const;

export type BoardReportReason = (typeof BOARD_REPORT_REASONS)[number]["value"];

export function isBoardReportReason(value: unknown): value is BoardReportReason {
  return BOARD_REPORT_REASONS.some((reason) => reason.value === value);
}

export const BOARD_RESTRICTED_MESSAGE = "掲示板の利用制限中は投稿・返信・いいねができません。";

const japanDateTime = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatBoardDateTime(value: Date | string) {
  return japanDateTime.format(new Date(value));
}

export function toJapanDateTimeInput(value: Date) {
  return new Date(+value + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

export function parseRestrictionExpiry(value: unknown, now = new Date()): Date | null {
  if (typeof value !== "string" || !/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return null;
  }

  const expiry = new Date(value + ":00+09:00");
  return expiry > now && toJapanDateTimeInput(expiry) === value ? expiry : null;
}
