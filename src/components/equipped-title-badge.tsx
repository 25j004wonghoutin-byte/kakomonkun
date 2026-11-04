import { DEFAULT_BANNER_COLOR, getBannerTextColor, normalizeBannerColor } from "@/lib/profile-banner";

export function EquippedTitleBadge({ name, color }: { name: string; color?: string | null }) {
  const backgroundColor = normalizeBannerColor(color) ?? DEFAULT_BANNER_COLOR;
  return <span className="inline-flex min-h-7 max-w-full items-center rounded-full border px-2.5 py-0.5 text-[13px] font-black [overflow-wrap:anywhere]" style={{ backgroundColor, borderColor: backgroundColor, color: getBannerTextColor(backgroundColor) }}>{name}</span>;
}
