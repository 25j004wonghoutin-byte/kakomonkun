import assert from "node:assert/strict";

export function imageQuestionReference({ sourceYear, questionNo }) {
  assert.ok(Number.isInteger(sourceYear) && sourceYear >= 2021 && sourceYear <= 2026, "Unsupported IPA year");
  assert.ok(Number.isInteger(questionNo) && questionNo >= 1 && questionNo <= 100, "Invalid IPA question number");
  return sourceYear + "年度 ITパスポート試験 公開問題 問" + questionNo + "（原題画像を参照）";
}

export function validateOfficialImageRecord(question) {
  const text = imageQuestionReference(question);
  const padded = String(question.questionNo).padStart(3, "0");
  assert.equal(question.sourceKey, "ipa-it-passport-" + question.sourceYear + "-" + padded, "IPA source identity mismatch");
  assert.equal(question.imagePath, "/kakomon/img/ipa/" + question.sourceYear + "/q" + padded + ".webp", "IPA image identity mismatch");
  assert.equal(question.sourceSeason, "公開問題", "IPA source season mismatch");
  return text;
}
