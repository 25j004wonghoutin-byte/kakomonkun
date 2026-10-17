export const MOCK_TABLES = Object.freeze(["mock_exams","mock_exam_questions","mock_attempts","mock_answers","monthly_rankings"]);

export function assertEmptyMockTables(counts) {
  for (const name of MOCK_TABLES) {
    if (!counts || !Number.isSafeInteger(counts[name]) || counts[name] < 0) {
      throw Object.assign(new Error("Invalid mock table preflight counts"),{code:"invalid_mock_counts"});
    }
    if (counts[name] !== 0) {
      throw Object.assign(new Error("Existing mock data must be preserved; migration stopped"),{code:"mock_data_exists"});
    }
  }
}

/** 呼出元が専用テストDBのloadTestConfigで作ったPrisma接続だけを渡す。 */
export async function applyMockMigration(db, sql) {
  const version="20261016000000";
  return db.$transaction(async tx=>{
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '30s'");
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('kakomonkun-mock-migration'))");
    const existing=await tx.$queryRaw`SELECT statements FROM supabase_migrations.schema_migrations WHERE version=${version}`;
    if(existing.length){
      if(existing[0].statements?.[0]?.replace(/\r\n/g,"\n")!==sql.replace(/\r\n/g,"\n"))throw new Error("Recorded mock migration differs; refusing to overwrite migration history");
      return {alreadyApplied:true};
    }
    await tx.$executeRawUnsafe("LOCK TABLE public.mock_exams,public.mock_exam_questions,public.mock_attempts,public.mock_answers,public.monthly_rankings IN ACCESS EXCLUSIVE MODE");
    const counts={};
    for(const [model,table] of [["mockExam","mock_exams"],["mockExamQuestion","mock_exam_questions"],["mockAttempt","mock_attempts"],["mockAnswer","mock_answers"],["monthlyRanking","monthly_rankings"]])counts[table]=await tx[model].count();
    assertEmptyMockTables(counts);
    await tx.$executeRawUnsafe(sql);
    await tx.$executeRaw`INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES (${version},'monthly_mock_exams',ARRAY[${sql}]::text[])`;
    return {alreadyApplied:false,counts};
  },{maxWait:10000,timeout:45000});
}

/** 承認された開始要求対応表だけを追加する。既存データはSQL内で保持・引継ぎする。 */
export async function applyMockStartRequestsMigration(db,sql) {
  const version="20261017000000";
  return db.$transaction(async tx=>{
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '30s'");
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('kakomonkun-mock-migration'))");
    const existing=await tx.$queryRaw`SELECT statements FROM supabase_migrations.schema_migrations WHERE version=${version}`;
    if(existing.length){
      if(existing[0].statements?.[0]?.replace(/\r\n/g,"\n")!==sql.replace(/\r\n/g,"\n"))throw new Error("Recorded start identity migration differs; refusing to overwrite history");
      return {alreadyApplied:true};
    }
    await tx.$executeRawUnsafe(sql);
    await tx.$executeRaw`INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES (${version},'mock_attempt_start_requests',ARRAY[${sql}]::text[])`;
    return {alreadyApplied:false};
  },{maxWait:10000,timeout:45000});
}
