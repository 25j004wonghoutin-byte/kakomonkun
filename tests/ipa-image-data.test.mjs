import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const read = name => JSON.parse(readFileSync(new URL("../" + name, import.meta.url), "utf8"));
const official = read("kakomon/ipa-it-passport-2021-2026.json");
const combined = read("supabase/generated-question-seed.json");

test("all 600 official questions keep images and grading but contain only image references", () => {
  assert.equal(official.length, 600);
  for (const q of official) {
    assert.equal(q.questionText, q.sourceYear + "年度 ITパスポート試験 公開問題 問" + q.questionNo + "（原題画像を参照）");
    assert.equal(q.imagePath, "/kakomon/img/ipa/" + q.sourceYear + "/q" + String(q.questionNo).padStart(3, "0") + ".webp");
    assert.equal(q.choices.length, 4);
    assert.equal(q.choices.filter(c => c.isCorrect).length, 1);
    assert.equal(q.displayMode, "official_scan");
    assert.deepEqual(combined.find(x => x.sourceKey === q.sourceKey), q);
  }
  assert.equal(combined.filter(q => q.sourceKey.startsWith("it-passport-supplemental-")).length, 31);
  assert.equal(combined.find(q => q.sourceKey === "it-passport-supplemental-1").questionText, "OSI基本参照モデルのトランスポート層で動作するプロトコルはどれか？");
});

test("seed generation strips stale OCR from external input and preserves every other field", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ipa-image-data-"));
  try {
    symlinkSync(fileURLToPath(new URL("../kakomon/img", import.meta.url)), path.join(dir, "img"), "junction");
    for (const name of ["questions.json", "kakomon_answers.json", "kakomon_questionsA.json", "kakomon_questionsS.json"]) {
      cpSync(new URL("../kakomon/" + name, import.meta.url), path.join(dir, name));
    }
    const stale = official.map(q => ({ ...q, questionText: "UNWANTED_OCR_BODY_" + q.sourceKey }));
    writeFileSync(path.join(dir, "ipa-it-passport-2021-2026.json"), JSON.stringify(stale), "utf8");
    const output = path.join(dir, "generated.json");
    const result = spawnSync(process.execPath, ["scripts/build-question-seed.mjs"], {
      cwd: new URL("../", import.meta.url), encoding: "utf8",
      env: { ...process.env, KAKOMON_SOURCE_DIR: dir, KAKOMON_SEED_OUTPUT: output },
    });
    assert.equal(result.status, 0, result.stderr);
    const generated = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(JSON.stringify(generated).includes("UNWANTED_OCR_BODY_"), false);
    const untouched = generated.filter(q => !q.sourceKey.startsWith("ipa-it-passport-"));
    assert.equal(untouched.length, 2031);
    for (const q of untouched) assert.deepEqual(q, combined.find(x => x.sourceKey === q.sourceKey), q.sourceKey);
    for (const q of generated.filter(q => q.sourceKey.startsWith("ipa-it-passport-"))) {
      const source = official.find(x => x.sourceKey === q.sourceKey);
      assert.deepEqual(q, { ...source, questionText: q.sourceYear + "年度 ITパスポート試験 公開問題 問" + q.questionNo + "（原題画像を参照）" });
    }
  } finally {
    assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir()) + path.sep));
    assert.ok(path.basename(dir).startsWith("ipa-image-data-"));
    rmSync(dir, { recursive: true, force: true });
  }
});
