import fs from "node:fs";
import path from "node:path";

const sourceRoot = process.env.KAKOMON_SOURCE_DIR ?? "C:/Users/WONGHOUTIN/Desktop/kakomon";
const outputPath = process.env.KAKOMON_SEED_OUTPUT ?? "supabase/generated-question-seed.json";

const readJson = (name) =>
  JSON.parse(fs.readFileSync(path.join(sourceRoot, name), "utf8"));

const categoryCode = (category) => {
  if (category.includes("マネジメント")) return "management";
  if (category.includes("ストラテジ")) return "strategy";
  return "technology";
};

const inferFeCategory = (question) => {
  const text = question.question;
  if (/経営|会計|財務|法務|契約|著作権|特許|マーケティング|企業|事業/.test(text)) {
    return "strategy";
  }
  if (/プロジェクト|サービスマネジメント|監査|工程|工数|開発モデル/.test(text)) {
    return "management";
  }
  return "technology";
};

const supplemental = readJson("questions.json").map((question, index) => ({
  sourceKey: `it-passport-supplemental-${index + 1}`,
  examCode: "it_passport",
  categoryCode: categoryCode(question.category),
  sourceYear: null,
  sourceSeason: "補助問題",
  questionNo: index + 1,
  questionText: question.question,
  imagePath: null,
  explanation: question.explanation,
  choices: question.options.map((text, choiceIndex) => ({
    label: ["A", "B", "C", "D"][choiceIndex],
    text,
    isCorrect: text === question.answer,
    sortOrder: choiceIndex + 1,
  })),
}));

const answerRoot = readJson("kakomon_answers.json");
const subjectAAnswers = answerRoot[Object.keys(answerRoot)[0]];
const subjectA = readJson("kakomon_questionsA.json").exam_data.flatMap((exam) =>
  exam.questions.map((question) => {
    const year = String(exam.year);
    const answerLabel = subjectAAnswers[year][String(question.id)];
    const imagePath = question.image_file
      ? `/${question.image_file.replace(/^..\/kakomon\//, "kakomon/")}`
      : null;

    return {
      sourceKey: `fe-subject-a-${year}-${question.id}`,
      examCode: "fe",
      categoryCode: inferFeCategory(question),
      sourceYear: Number.isInteger(exam.year) ? exam.year : null,
      sourceSeason: exam.title,
      questionNo: question.id,
      questionText: question.question,
      imagePath,
      explanation: null,
      choices: Object.entries(question.options).map(([label, text], index) => ({
        label,
        text,
        isCorrect: label === answerLabel,
        sortOrder: index + 1,
      })),
    };
  }),
);

const questions = [...supplemental, ...subjectA];
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(questions, null, 2)}\n`);
console.log(`Generated ${questions.length} questions at ${outputPath}`);
