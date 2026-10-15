import { AVATAR_BODY_BYTES, AVATAR_BYTES, AvatarError } from "./contract";

const invalid = () => new AvatarError("invalid_body", 400, "画像の入力内容を確認してください。");
const tooLarge = () => new AvatarError("body_size", 413, "画像の容量が上限を超えています。");

async function readBounded(request: Request, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  const reader = request.body?.getReader();
  if (!reader) throw invalid();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        throw tooLarge();
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

function expectation(value: unknown): string | null {
  if (value !== null && typeof value !== "string") throw invalid();
  return value;
}

export async function readAvatarUpload(request: Request): Promise<{image: Uint8Array; expectedAvatarUrl: string | null}> {
  const type = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(type)) throw invalid();
  const bytes = await readBounded(request, AVATAR_BODY_BYTES);
  let form: FormData;
  try { form = await new Response(bytes, { headers: { "content-type": type } }).formData(); }
  catch { throw invalid(); }
  const keys = [...form.keys()];
  if (keys.length !== 2 || form.getAll("image").length !== 1 || form.getAll("expectedAvatarUrl").length !== 1) throw invalid();
  const file = form.get("image");
  const raw = form.get("expectedAvatarUrl");
  if (!(file instanceof Blob) || !file.size || typeof raw !== "string") throw invalid();
  if (file.size > AVATAR_BYTES) throw tooLarge();
  let expectedAvatarUrl: string | null;
  try { expectedAvatarUrl = expectation(JSON.parse(raw)); } catch { throw invalid(); }
  return { image: new Uint8Array(await file.arrayBuffer()), expectedAvatarUrl };
}

export async function readAvatarDelete(request: Request): Promise<{expectedAvatarUrl: string | null}> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) throw invalid();
  const bytes = await readBounded(request, 64 * 1024);
  try {
    const body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!body || Array.isArray(body) || Object.keys(body).length !== 1 || !("expectedAvatarUrl" in body)) throw invalid();
    return { expectedAvatarUrl: expectation(body.expectedAvatarUrl) };
  } catch { throw invalid(); }
}
