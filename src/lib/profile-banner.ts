export const DEFAULT_BANNER_COLOR = "#deece6";
export const BANNER_COLORS = [
  { name: "ミント", value: DEFAULT_BANNER_COLOR },
  { name: "ブルー", value: "#dce9f8" },
  { name: "ラベンダー", value: "#e9e1f4" },
  { name: "ピンク", value: "#f6e0e7" },
  { name: "ピーチ", value: "#f8e5d5" },
  { name: "イエロー", value: "#f3edce" },
] as const;
export function normalizeBannerColor(value: unknown): string | null {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
}

export function getBannerTextColor(value: string): "#000000" | "#ffffff" {
  const color = normalizeBannerColor(value) ?? DEFAULT_BANNER_COLOR;
  const channels = [1, 3, 5].map(offset => {
    const value = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? "#000000" : "#ffffff";
}
