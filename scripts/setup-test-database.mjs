import { readFileSync, readdirSync } from "node:fs";
import pg from "pg";
import { assertEmptyTestDatabase, loadTestConfig, TEST_PROJECT_REF } from "./test-environment.mjs";

let client;
let phase = "configuration";
try {
  const config = loadTestConfig();
  client = new pg.Client({ connectionString: config.DIRECT_URL, connectionTimeoutMillis: 10000 });
  phase = "connection";
  await client.connect();
  await client.query("BEGIN");
  await client.query("SET LOCAL statement_timeout = '60s'");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('kakomonkun-test-schema-setup'))");
  phase = "empty-database guard";
  const tables = await client.query("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'");
  assertEmptyTestDatabase(tables.rows[0].count);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const migrationsDir = new URL("../supabase/migrations/", import.meta.url);
  const migrations = readdirSync(migrationsDir).filter((name) => /^\d{14}_.+\.sql$/.test(name)).sort();
  phase = "migrations";
  await client.query("CREATE SCHEMA IF NOT EXISTS supabase_migrations");
  await client.query("CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY, statements text[], name text)");
  for (const filename of migrations) {
    phase = filename;
    const sql = decoder.decode(readFileSync(new URL(filename, migrationsDir)));
    await client.query(sql);
    await client.query("INSERT INTO supabase_migrations.schema_migrations(version, name, statements) VALUES ($1, $2, $3)", [filename.slice(0, 14), filename.slice(15, -4), [sql]]);
  }
  phase = "master data";
  await client.query(`
    INSERT INTO public.roles (name, description, updated_at) VALUES ('student', '学生', now()), ('teacher', '教師・管理者相当', now());
    INSERT INTO public.exams (code, name, description, updated_at) VALUES ('it_passport', 'ITパスポート', 'ITパスポート試験', now()), ('fe', '基本情報技術者', '基本情報技術者試験', now());
    INSERT INTO public.question_categories (code, name, sort_order, updated_at) VALUES ('technology', 'テクノロジ系', 1, now()), ('management', 'マネジメント系', 2, now()), ('strategy', 'ストラテジ系', 3, now());
  `);
  phase = "question data";
  const questions = JSON.parse(decoder.decode(readFileSync(new URL("../supabase/generated-question-seed.json", import.meta.url))));
  if (!Array.isArray(questions) || questions.length === 0 || questions.some((q) => !q.sourceKey || !q.questionText || !Array.isArray(q.choices) || q.choices.filter((c) => c.isCorrect).length !== 1)) throw new Error("Invalid question seed");
  await client.query(`
    WITH payload AS (SELECT value AS q FROM jsonb_array_elements($1::jsonb)), inserted AS (
      INSERT INTO public.questions (source_key, exam_id, category_id, source_year, source_season, question_no, question_text, image_path, explanation, updated_at)
      SELECT q->>'sourceKey', e.id, c.id, (q->>'sourceYear')::int, q->>'sourceSeason', (q->>'questionNo')::int, q->>'questionText', q->>'imagePath', q->>'explanation', now()
      FROM payload JOIN public.exams e ON e.code = q->>'examCode' JOIN public.question_categories c ON c.code = q->>'categoryCode'
      RETURNING id, source_key
    )
    INSERT INTO public.question_choices (question_id, choice_label, choice_text, is_correct, sort_order, updated_at)
    SELECT i.id, choice->>'label', choice->>'text', (choice->>'isCorrect')::boolean, (choice->>'sortOrder')::int, now()
    FROM payload JOIN inserted i ON i.source_key = q->>'sourceKey' CROSS JOIN LATERAL jsonb_array_elements(q->'choices') AS choice
  `, [JSON.stringify(questions)]);
  const result = await client.query("SELECT (SELECT count(*)::int FROM public.questions) AS questions, (SELECT count(*)::int FROM public.question_choices) AS choices, (SELECT count(*)::int FROM public.titles WHERE catalog_key IS NOT NULL) AS titles");
  if (result.rows[0].questions !== questions.length || result.rows[0].titles !== 66) throw new Error("Incomplete test master data");
  await client.query("COMMIT");
  console.log(JSON.stringify({ project: TEST_PROJECT_REF, migrations: migrations.length, ...result.rows[0], setup: "complete" }));
} catch (error) {
  if (client) await client.query("ROLLBACK").catch(() => {});
  console.error(`Test setup failed at ${phase}; no reset is attempted.`);
  if (typeof error.code === "string" && /^[A-Z0-9_]+$/.test(error.code)) console.error(`Error code: ${error.code}`);
  process.exitCode = 1;
} finally { if (client) await client.end().catch(() => {}); }
