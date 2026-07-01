import fs from "node:fs";
import pg from "pg";

const { Client } = pg;

const envFiles = [".env", ".env.local"];
for (const file of envFiles) {
  if (!fs.existsSync(file)) continue;

  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
    if (!match) continue;

    const key = match[1].trim();
    let value = match[2].trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] ??= value;
  }
}

const seedPath = process.env.KAKOMON_SEED_INPUT ?? "supabase/generated-question-seed.json";
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const questions = JSON.parse(fs.readFileSync(seedPath, "utf8"));

if (!Array.isArray(questions)) {
  throw new Error("Question seed must be an array");
}

const requireText = (value, fieldName) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} is required`);
  }
  return value;
};

const validateQuestion = (question) => {
  const sourceKey = requireText(question.sourceKey, "sourceKey");
  requireText(question.examCode, `examCode for ${sourceKey}`);
  requireText(question.categoryCode, `categoryCode for ${sourceKey}`);
  requireText(question.questionText, `questionText for ${sourceKey}`);

  if (question.sourceSeason && Array.from(question.sourceSeason).length > 30) {
    throw new Error(`sourceSeason is too long for ${question.sourceKey}`);
  }

  if (!Array.isArray(question.choices) || question.choices.length === 0) {
    throw new Error(`choices are required for ${sourceKey}`);
  }

  const correctCount = question.choices.filter((choice) => choice.isCorrect).length;
  if (correctCount !== 1) {
    throw new Error(`${sourceKey} must have exactly one correct choice`);
  }

  for (const choice of question.choices) {
    requireText(choice.label, `choice label for ${sourceKey}`);
    requireText(choice.text, `choice text for ${sourceKey}`);
  }
};

const client = new Client({ connectionString });

await client.connect();

try {
  await client.query("begin");

  const examResult = await client.query("select id, code from exams");
  const categoryResult = await client.query("select id, code from question_categories");
  const examIds = new Map(examResult.rows.map((row) => [row.code, row.id]));
  const categoryIds = new Map(categoryResult.rows.map((row) => [row.code, row.id]));

  let upsertedQuestions = 0;
  let upsertedChoices = 0;

  for (const question of questions) {
    validateQuestion(question);

    const examId = examIds.get(question.examCode);
    const categoryId = categoryIds.get(question.categoryCode);

    if (!examId) {
      throw new Error(`Unknown examCode: ${question.examCode}`);
    }

    if (!categoryId) {
      throw new Error(`Unknown categoryCode: ${question.categoryCode}`);
    }

    const questionResult = await client.query(
      `
        insert into questions (
          source_key,
          exam_id,
          category_id,
          source_year,
          source_season,
          question_no,
          question_text,
          image_path,
          explanation,
          question_type,
          status,
          updated_at
        ) values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, 'single_choice', 'published', now()
        )
        on conflict (source_key) do update set
          exam_id = excluded.exam_id,
          category_id = excluded.category_id,
          source_year = excluded.source_year,
          source_season = excluded.source_season,
          question_no = excluded.question_no,
          question_text = excluded.question_text,
          image_path = excluded.image_path,
          explanation = excluded.explanation,
          question_type = 'single_choice',
          status = 'published',
          updated_at = now()
        returning id
      `,
      [
        question.sourceKey,
        examId,
        categoryId,
        question.sourceYear,
        question.sourceSeason,
        question.questionNo,
        question.questionText,
        question.imagePath,
        question.explanation,
      ],
    );

    const questionId = questionResult.rows[0].id;
    upsertedQuestions += 1;

    for (const choice of question.choices) {
      await client.query(
        `
          insert into question_choices (
            question_id,
            choice_label,
            choice_text,
            is_correct,
            sort_order,
            updated_at
          ) values (
            $1, $2, $3, $4, $5, now()
          )
          on conflict (question_id, sort_order) do update set
            choice_label = excluded.choice_label,
            choice_text = excluded.choice_text,
            is_correct = excluded.is_correct,
            updated_at = now()
        `,
        [questionId, choice.label, choice.text, choice.isCorrect, choice.sortOrder],
      );
      upsertedChoices += 1;
    }
  }

  await client.query("commit");
  console.log(`Upserted ${upsertedQuestions} questions and ${upsertedChoices} choices.`);
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
