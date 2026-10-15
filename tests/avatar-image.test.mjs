import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
let image = {};
try { image = await import("../src/lib/avatars/image.ts"); } catch (e) { if (e.code !== "ERR_MODULE_NOT_FOUND") throw e; }
const make = (width = 512, color = "#ff000080") => sharp({ create: { width, height: 512, channels: 4, background: color } });

test("avatar normalization decodes a static WebP, preserves transparency and removes metadata", async () => {
  assert.equal(typeof image.normalizeAvatarImage, "function");
  const input = await make().withMetadata({ orientation: 6 }).webp().toBuffer();
  const output = Buffer.from(await image.normalizeAvatarImage(input));
  const meta = await sharp(output).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.width, 512);
  assert.equal(meta.height, 512);
  assert.equal(meta.pages ?? 1, 1);
  assert.equal(meta.exif, undefined);
  assert.equal(meta.hasAlpha, true);
  assert.ok(output.byteLength <= 2 * 1024 * 1024);
  const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 4);
  assert.ok(data[3] >= 127 && data[3] <= 129);
});
test("avatar normalization rejects empty oversized forged broken and wrong-sized input", async () => {
  assert.equal(typeof image.normalizeAvatarImage, "function");
  const broken = Buffer.from("RIFFxxxxWEBPbroken");
  for (const [input, status] of [
    [Buffer.alloc(0), 400], [Buffer.alloc(2 * 1024 * 1024 + 1), 413],
    [await make().png().toBuffer(), 415], [broken, 400], [await make(511).webp().toBuffer(), 400],
  ]) await assert.rejects(() => image.normalizeAvatarImage(input), (e) => e.status === status);
});
test("avatar normalization rejects animated WebP rather than silently saving frame one", async () => {
  assert.equal(typeof image.normalizeAvatarImage, "function");
  const frames = await Promise.all([make(512, "red").png().toBuffer(), make(512, "blue").png().toBuffer()]);
  const input = await sharp(frames, { join: { animated: true } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
  assert.equal((await sharp(input).metadata()).pages, 2);
  await assert.rejects(() => image.normalizeAvatarImage(input), (e) => e.status === 400);
});
