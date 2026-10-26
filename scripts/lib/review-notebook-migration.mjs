const required = {
  review_notebook_items: {
    constraints: ["review_notebook_items_pkey", "review_items_user_question_key", "review_items_id_user_key", "review_items_user_fkey", "review_items_question_fkey", "review_items_status_check", "review_items_revision_check"],
    indexes: ["idx_review_items_user_status_wrong", "idx_review_items_user_wrong", "idx_review_items_question"],
  },
  review_notebook_answers: {
    constraints: ["review_notebook_answers_pkey", "review_answers_item_revision_key", "review_answers_item_user_fkey", "review_answers_choice_fkey", "review_answers_revision_check", "review_answers_version_check"],
    indexes: ["idx_review_answers_item_user", "idx_review_answers_choice"],
  },
};
const stopped = code => Object.assign(new Error("Review notebook migration stopped"), { code });

export function assertReviewNotebookCatalog(rows) {
  for (const [name, expected] of Object.entries(required)) {
    const row = rows.find(value => value.table_name === name);
    if (!row || row.rls !== true || row.direct_access !== false || Number(row.policies) !== 0 ||
        !expected.constraints.every(value => row.constraints?.includes(value)) ||
        !expected.indexes.every(value => row.indexes?.includes(value))) throw stopped("review_catalog_drift");
  }
}

async function catalog(tx) {
  return tx.$queryRaw`SELECT t.relname AS table_name, t.relrowsecurity AS rls,
    (has_table_privilege('anon', t.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR
     has_table_privilege('authenticated', t.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS direct_access,
    (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=t.oid) AS policies,
    ARRAY(SELECT c.conname::text FROM pg_constraint c WHERE c.conrelid=t.oid AND c.convalidated) AS constraints,
    ARRAY(SELECT i.relname::text FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid WHERE x.indrelid=t.oid AND x.indisvalid) AS indexes
    FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='public' AND t.relname IN ('review_notebook_items','review_notebook_answers')`;
}

/** Only pass a Prisma connection built from validated loadTestConfig().DIRECT_URL. */
export async function applyReviewNotebookMigration(db, sql) {
  const version = "20261026000000";
  return db.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '30s'");
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('kakomonkun-review-notebook-migration'))");
    const history = await tx.$queryRaw`SELECT statements FROM supabase_migrations.schema_migrations WHERE version=${version}`;
    const before = await catalog(tx);
    if (history.length) {
      if (history.length !== 1 || history[0].statements?.length !== 1 || history[0].statements[0].replace(/\r\n/g, "\n") !== sql.replace(/\r\n/g, "\n")) throw stopped("review_sql_drift");
      assertReviewNotebookCatalog(before);
      return { alreadyApplied: true };
    }
    if (before.length) throw stopped("review_unrecorded_tables");
    await tx.$executeRawUnsafe(sql);
    assertReviewNotebookCatalog(await catalog(tx));
    await tx.$executeRaw`INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES (${version},'review_notebook',ARRAY[${sql}]::text[])`;
    return { alreadyApplied: false };
  }, { maxWait: 10000, timeout: 45000 });
}
