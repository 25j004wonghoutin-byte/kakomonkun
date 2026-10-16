import { AVATAR_BYTES, AVATAR_SIZE, AVATAR_SOURCE_BYTES } from "@/lib/avatars/contract";
import { avatarSourceRect, type CropState } from "@/lib/avatars/crop";

export type PreparedAvatar = { width: number; height: number; source: CanvasImageSource; dispose(): void };

export async function prepareAvatarSource(file: File): Promise<PreparedAvatar> {
  if (!file.size) throw new Error("空のファイルは選択できません。");
  if (file.size > AVATAR_SOURCE_BYTES) throw new Error("画像は5MB以下にしてください。");
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpeg = header[0] === 255 && header[1] === 216 && header[2] === 255;
  const png = [137,80,78,71,13,10,26,10].every((b, i) => header[i] === b);
  const webp = String.fromCharCode(...header.slice(0, 4)) === "RIFF" && String.fromCharCode(...header.slice(8, 12)) === "WEBP";
  if (!jpeg && !png && !webp) throw new Error("JPEG・PNG・WebPの画像を選択してください。GIF・SVG・HEICは利用できません。");
  if (typeof createImageBitmap !== "function") throw new Error("このブラウザーでは画像編集を利用できません。別のブラウザーでお試しください。");
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { throw new Error("画像を読み込めませんでした。別の画像を選択してください。"); }
  if (!bitmap.width || !bitmap.height) { bitmap.close(); throw new Error("画像を読み込めませんでした。"); }
  let released = false;
  return { width: bitmap.width, height: bitmap.height, source: bitmap, dispose() { if (!released) { released = true; bitmap.close(); } } };
}

export function drawAvatarCrop(canvas: HTMLCanvasElement, prepared: PreparedAvatar, state: CropState) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("このブラウザーでは画像編集を利用できません。");
  const r = avatarSourceRect(prepared.width, prepared.height, state);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(prepared.source, r.sx, r.sy, r.sw, r.sh, 0, 0, canvas.width, canvas.height);
}

export async function encodeAvatarCrop(prepared: PreparedAvatar, state: CropState): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE; canvas.height = AVATAR_SIZE;
  try {
    drawAvatarCrop(canvas, prepared, state);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", 0.85));
    if (!blob || blob.type !== "image/webp") throw new Error("このブラウザーはWebP形式の保存に対応していません。");
    if (!blob.size || blob.size > AVATAR_BYTES) throw new Error("保存画像の容量が上限を超えています。別の画像を選択してください。");
    return blob;
  } finally { canvas.width = 0; canvas.height = 0; }
}
