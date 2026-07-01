import fs from "node:fs";
import path from "node:path";

const defaultSourceRoot = fs.existsSync("kakomon")
  ? "kakomon"
  : "C:/Users/WONGHOUTIN/Desktop/kakomon";
const sourceRoot = process.env.KAKOMON_SOURCE_DIR ?? defaultSourceRoot;
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
  if (/経営|会計|財務|法務|著作権|特許|マーケティング|企業|事業|SWOT|PEST|戦略/.test(text)) {
    return "strategy";
  }
  if (/プロジェクト|サービスマネジメント|監査|工程|工数|開発モデル|品質管理|レビュー/.test(text)) {
    return "management";
  }
  return "technology";
};

const normalizeImagePath = (imageFile) => {
  if (!imageFile) return null;

  const normalized = imageFile.replaceAll("\\", "/");
  const withoutParent = normalized
    .replace(/^\.\.\//, "")
    .replace(/^kakommon\//, "kakomon/")
    .replace(/^kakomom\//, "kakomon/");
  const withKakomonRoot = withoutParent
    .replace(/^kakomon\/(?!img\/)/, "kakomon/img/")
    .replace(/^kakomon\//, "kakomon/");

  return `/${withKakomonRoot.replace(/^\/+/, "")}`;
};

const sourceImageExists = (publicPath) => {
  if (!publicPath?.startsWith("/kakomon/")) return false;

  const sourcePath = path.join(sourceRoot, publicPath.replace(/^\/kakomon\//, ""));
  return fs.existsSync(sourcePath);
};

const resolveImagePath = (question, exam) => {
  const normalized = normalizeImagePath(imageFile(question));
  if (!normalized) return null;
  if (sourceImageExists(normalized)) return normalized;

  if (!Number.isInteger(exam.year) || !Number.isInteger(question.id)) {
    return normalized;
  }

  const year = String(exam.year);
  const questionNo = String(question.id);
  const paddedQuestionNo = questionNo.padStart(2, "0");
  const candidates = [
    `/kakomon/img/${year}S/${questionNo}.png`,
    `/kakomon/img/${year}S/${year}Q${questionNo}.png`,
    `/kakomon/img/${year}S/${year}Q${paddedQuestionNo}.png`,
  ];

  return candidates.find(sourceImageExists) ?? normalized;
};

const isImageReference = (value) =>
  typeof value === "string" && /\.(png|jpe?g|gif|webp)$/i.test(value.trim());

const imageFile = (question) => {
  if (question.image_file) return question.image_file;
  if (isImageReference(question.question)) return question.question;
  return "";
};

const questionText = (question) => {
  if (isImageReference(question.question)) {
    return "問題画像を参照してください。";
  }

  if (typeof question.question === "string" && question.question.trim()) {
    return question.question;
  }

  if (imageFile(question)) {
    return "問題画像を参照してください。";
  }

  return question.question;
};

const choiceText = (label, text, imagePath) => {
  if (typeof text === "string" && text.trim()) {
    return text;
  }

  if (imagePath) {
    return `${label}（画像参照）`;
  }

  return text;
};

const subjectASeason = (exam) => {
  if (Number.isInteger(exam.year)) {
    return `${exam.era_name ?? exam.year} 公開問題`;
  }

  return "サンプル公開問題";
};

const subjectSSeason = (exam) => {
  if (Number.isInteger(exam.year)) {
    const value = String(exam.year);
    if (/^\d{6}$/.test(value)) {
      return `${value.slice(0, 4)}年${Number(value.slice(4))}月 修了認定`;
    }

    return `${exam.era_name ?? value} 修了認定`;
  }

  return "サンプル修了認定";
};

const buildSupplementalQuestions = () =>
  readJson("questions.json").map((question, index) => ({
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

const buildFeQuestions = ({ fileName, answers, sourcePrefix, seasonName }) =>
  readJson(fileName).exam_data.flatMap((exam) =>
    exam.questions.map((question) => {
      const year = String(exam.year);
      const answerLabel = answers?.[year]?.[String(question.id)] ?? null;
      const imagePath = resolveImagePath(question, exam);

      return {
        sourceKey: `fe-${sourcePrefix}-${year}-${question.id}`,
        examCode: "fe",
        categoryCode: inferFeCategory(question),
        sourceYear: Number.isInteger(exam.year) ? exam.year : null,
        sourceSeason: seasonName(exam),
        questionNo: question.id,
        questionText: questionText(question),
        imagePath,
        explanation: null,
        choices: Object.entries(question.options).map(([label, text], index) => ({
          label,
          text: choiceText(label, text, imagePath),
          isCorrect: label === answerLabel,
          sortOrder: index + 1,
        })),
      };
    }),
  );

const answerRoot = readJson("kakomon_answers.json");
const supplemental = buildSupplementalQuestions();
const subjectA = buildFeQuestions({
  fileName: "kakomon_questionsA.json",
  answers: answerRoot["科目A試験"],
  sourcePrefix: "subject-a",
  seasonName: subjectASeason,
});
const subjectS = buildFeQuestions({
  fileName: "kakomon_questionsS.json",
  answers: answerRoot["科目A修了認定試験"],
  sourcePrefix: "subject-s",
  seasonName: subjectSSeason,
});

const questions = [...supplemental, ...subjectA, ...subjectS];

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(questions, null, 2)}\n`, "utf8");
console.log(`Generated ${questions.length} questions at ${outputPath}`);
