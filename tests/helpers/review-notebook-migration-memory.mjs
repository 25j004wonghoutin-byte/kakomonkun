export const reviewCatalog = () => [
  { table_name: "review_notebook_items", rls: true, direct_access: false, policies: 0,
    constraints: ["review_notebook_items_pkey", "review_items_user_question_key", "review_items_id_user_key", "review_items_user_fkey", "review_items_question_fkey", "review_items_status_check", "review_items_revision_check"],
    indexes: ["idx_review_items_user_status_wrong", "idx_review_items_user_wrong", "idx_review_items_question"] },
  { table_name: "review_notebook_answers", rls: true, direct_access: false, policies: 0,
    constraints: ["review_notebook_answers_pkey", "review_answers_item_revision_key", "review_answers_item_user_fkey", "review_answers_choice_fkey", "review_answers_revision_check", "review_answers_version_check"],
    indexes: ["idx_review_answers_item_user", "idx_review_answers_choice"] },
];

export function migrationMemory({ history = [], catalog = [], fail = false } = {}) {
  const state = { history: structuredClone(history), catalog: structuredClone(catalog), ddl: [], events: [] };
  return { state, db: { async $transaction(run) {
    const draft = structuredClone(state);
    const tx = {
      async $queryRaw(parts) {
        const sql = parts.join("?");
        if (sql.includes("schema_migrations")) return draft.history;
        if (sql.includes("pg_class")) return draft.catalog;
        throw new Error("unexpected catalog read");
      },
      async $executeRawUnsafe(sql) {
        draft.events.push(sql);
        if (/^SET LOCAL|^SELECT pg_advisory/.test(sql)) return 0;
        draft.ddl.push(sql); if (fail) throw new Error("ddl failed");
        draft.catalog = reviewCatalog(); return 0;
      },
      async $executeRaw(parts, version, sql) { draft.history.push({ version, statements: [sql] }); return 1; },
    };
    const result = await run(tx); Object.assign(state, draft); return result;
  } } };
}
