import sharp from "sharp";
import { AVATAR_BYTES, AVATAR_SIZE, AvatarError } from "./contract";

export async function normalizeAvatarImage(bytes: Uint8Array): Promise<Uint8Array> {
  const invalid = () => new AvatarError("invalid_image", 400, "512×512pxの静止画像を選択し直してください。");
  if (!bytes.byteLength) throw invalid();
  if (bytes.byteLength > AVATAR_BYTES) throw new AvatarError("image_size", 413, "画像の容量が上限を超えています。");
  const input = Buffer.from(bytes);
  if (input.toString("ascii", 0, 4) !== "RIFF" || input.toString("ascii", 8, 12) !== "WEBP") {
    throw new AvatarError("image_type", 415, "送信画像はWebP形式である必要があります。");
  }
  try {
    const image = sharp(input, { limitInputPixels: AVATAR_SIZE * AVATAR_SIZE, failOn: "warning" });
    const metadata = await image.metadata();
    if (metadata.format !== "webp" || metadata.width !== AVATAR_SIZE || metadata.height !== AVATAR_SIZE
      || (metadata.pages ?? 1) !== 1) throw invalid();
    const output = await image.webp({ quality: 85 }).toBuffer();
    if (output.byteLength > AVATAR_BYTES) throw new AvatarError("image_size", 413, "画像の容量が上限を超えています。");
    return output;
  } catch (cause) {
    if (cause instanceof AvatarError) throw cause;
    throw invalid();
  }
}
