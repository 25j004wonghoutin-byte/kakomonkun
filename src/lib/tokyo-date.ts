export function getTokyoDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getTokyoDayRange(date = new Date()) {
  const dateString = getTokyoDate(date);
  const start = new Date(`${dateString}T00:00:00+09:00`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { dateString, start, end };
}

export function getTokyoMonthRange(date = new Date()) {
  const [year, month] = getTokyoDate(date).split("-").map(Number);
  const start = getTokyoMonthBoundary(year, month - 1);
  const end = getTokyoMonthBoundary(year, month);
  const previousStart = getTokyoMonthBoundary(year, month - 2);

  return {
    monthString: `${year}-${String(month).padStart(2, "0")}`,
    start,
    end,
    previousStart,
  };
}

function getTokyoMonthBoundary(year: number, zeroBasedMonth: number) {
  const normalized = new Date(Date.UTC(year, zeroBasedMonth, 1));
  const normalizedYear = normalized.getUTCFullYear();
  const normalizedMonth = String(normalized.getUTCMonth() + 1).padStart(2, "0");
  return new Date(`${normalizedYear}-${normalizedMonth}-01T00:00:00+09:00`);
}
