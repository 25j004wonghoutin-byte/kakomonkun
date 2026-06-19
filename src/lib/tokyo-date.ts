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
