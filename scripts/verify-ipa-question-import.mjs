import fs from "node:fs";
import pg from "pg";

const { Client } = pg;

for (const file of [".env", ".env.local"]) {
  if (!fs.existsSync(file)) continue;

  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
    if (!match) continue;

    const key = match[1].trim();
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  const yearResult = await client.query(`
    select source_year as year, count(*)::int as count
    from questions
    where source_key like 'ipa-it-passport-%'
    group by source_year
    order by source_year
  `);
  const totalResult = await client.query(`
    select count(*)::int as count
    from questions q
    join exams e on e.id = q.exam_id
    where e.code = 'it_passport'
      and q.deleted_at is null
  `);
  const choiceResult = await client.query(`
    select count(*)::int as count
    from question_choices c
    join questions q on q.id = c.question_id
    where q.source_key like 'ipa-it-passport-%'
  `);
  const imageResult = await client.query(`
    select count(*)::int as count
    from questions
    where source_key like 'ipa-it-passport-%'
      and image_path like '/kakomon/img/ipa/%'
  `);
  const invalidResult = await client.query(`
    select count(*)::int as count
    from (
      select q.id
      from questions q
      left join question_choices c on c.question_id = q.id
      where q.source_key like 'ipa-it-passport-%'
      group by q.id
      having count(c.id) <> 4
        or count(c.id) filter (where c.is_correct) <> 1
        or max(q.image_path) is null
        or max(q.image_path) not like '/kakomon/img/ipa/%'
        or count(c.id) filter (where c.choice_text like '%原題画像を参照%') <> 4
    ) invalid
  `);
  const textResult = await client.query(`
    select question_no, question_text
    from questions
    where source_key like 'ipa-it-passport-%'
    order by source_year, question_no
  `);

  const byYear = Object.fromEntries(
    yearResult.rows.map((row) => [String(row.year), row.count]),
  );
  const result = {
    officialQuestions: Object.values(byYear).reduce((sum, count) => sum + count, 0),
    byYear,
    itPassportQuestions: totalResult.rows[0].count,
    officialChoices: choiceResult.rows[0].count,
    imageQuestionCount: imageResult.rows[0].count,
    invalidOfficialQuestions: invalidResult.rows[0].count,
    numberedQuestionCount: textResult.rows.filter((row) =>
      /^\s*[問間]\s*\d+/.test(row.question_text),
    ).length,
    leakedFollowingQuestionCount: textResult.rows.filter((row) => {
      const nextQuestion = Number(row.question_no) + 1;
      return new RegExp(`問\\s*${nextQuestion}(?:\\D|$)`).test(row.question_text);
    }).length,
  };

  console.log(JSON.stringify(result, null, 2));

  const expectedYears = ["2021", "2022", "2023", "2024", "2025", "2026"];
  const valid =
    result.officialQuestions === 600 &&
    expectedYears.every((year) => byYear[year] === 100) &&
    result.itPassportQuestions === 631 &&
    result.officialChoices === 2400 &&
    result.imageQuestionCount === 600 &&
    result.invalidOfficialQuestions === 0 &&
    result.numberedQuestionCount === 0 &&
    result.leakedFollowingQuestionCount === 0;

  if (!valid) process.exitCode = 1;
} finally {
  await client.end();
}
