"use client";

import Image from "next/image";

const LOCAL_KAKOMON_IMAGE_PATTERN = /^\/kakomon\/img\/.+\.(png|jpe?g|gif|webp)$/i;
const IMAGE_REFERENCE_PATTERN = /\.(png|jpe?g|gif|webp)$/i;

export function normalizeKakomonImagePath(value: string) {
  const trimmed = value.trim().replaceAll("\\", "/");
  if (!IMAGE_REFERENCE_PATTERN.test(trimmed)) return null;

  const normalized = trimmed
    .replace(/^(\.\.\/)+/, "")
    .replace(/^(\.\/)+/, "")
    .replace(/^\/+/, "")
    .replace(/^kakommon\//, "kakomon/")
    .replace(/^kakomom\//, "kakomon/")
    .replace(/^kakomon\/(?!img\/)/, "kakomon/img/");

  const publicPath = `/${normalized}`;
  return LOCAL_KAKOMON_IMAGE_PATTERN.test(publicPath) ? publicPath : null;
}

export function QuestionChoiceContent({
  text,
  label,
}: {
  text: string;
  label: string;
}) {
  const imagePath = normalizeKakomonImagePath(text);

  if (!imagePath) {
    return (
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
        {text}
      </span>
    );
  }

  return (
    <span className="min-w-0 flex-1">
      <Image
        src={imagePath}
        alt={`選択肢${label}の画像`}
        width={520}
        height={180}
        className="h-auto max-h-40 w-auto max-w-full rounded-md border border-slate-200 bg-white object-contain p-2"
      />
    </span>
  );
}
