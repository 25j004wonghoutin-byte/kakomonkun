import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_ERROR = "問題画像を読み込めませんでした。時間をおいて再試行してください。";

export async function readQuestionImageInput(imagePath: string) {
  try {
    if (
      !/^\/kakomon\/[A-Za-z0-9_./-]+\.(?:png|webp|jpe?g)$/i.test(imagePath) ||
      imagePath.split("/").some((part) => part === "." || part === "..")
    ) {
      throw new Error(IMAGE_ERROR);
    }
    const root = await realpath(path.join(process.cwd(), "public", "kakomon"));
    const file = await realpath(path.join(root, imagePath.slice("/kakomon/".length)));
    const relative = path.relative(root, file);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(IMAGE_ERROR);
    const info = await stat(file);
    if (!info.isFile() || info.size === 0 || info.size > MAX_IMAGE_BYTES) throw new Error(IMAGE_ERROR);
    const bytes = await readFile(file);
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) throw new Error(IMAGE_ERROR);
    const extension = path.extname(file).toLowerCase();
    let mimeType: "image/png" | "image/webp" | "image/jpeg";
    if (extension === ".png" && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      mimeType = "image/png";
    } else if (extension === ".webp" && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
      mimeType = "image/webp";
    } else if ([".jpg", ".jpeg"].includes(extension) && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
      mimeType = "image/jpeg";
    } else {
      throw new Error(IMAGE_ERROR);
    }
    return { type: "image" as const, mime_type: mimeType, data: bytes.toString("base64"), resolution: "high" as const };
  } catch {
    throw new Error(IMAGE_ERROR);
  }
}
