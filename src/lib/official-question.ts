export const IPA_QUESTION_SOURCE_URL =
  "https://www3.jitec.ipa.go.jp/JitesCbt/html/openinfo/questions.html";

type QuestionSourceFields = {
  imagePath: string | null;
  sourceYear: number | null;
  sourceSeason: string | null;
  questionNo: number | null;
};

export type QuestionPresentation = {
  displayMode: "standard" | "official_scan";
  source: {
    label: string;
    url: string;
  } | null;
};

export function getQuestionPresentation(
  question: QuestionSourceFields,
): QuestionPresentation {
  const isOfficialIpaQuestion =
    question.imagePath?.startsWith("/kakomon/img/ipa/") === true &&
    question.sourceSeason === "公開問題" &&
    Number.isInteger(question.sourceYear) &&
    Number.isInteger(question.questionNo);

  if (!isOfficialIpaQuestion) {
    return { displayMode: "standard", source: null };
  }

  return {
    displayMode: "official_scan",
    source: {
      label: `${question.sourceYear}年度 ITパスポート試験 公開問題 問${question.questionNo}（IPA）`,
      url: IPA_QUESTION_SOURCE_URL,
    },
  };
}
