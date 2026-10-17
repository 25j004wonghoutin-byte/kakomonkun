import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

const url = new URL("../scripts/lib/mock-migration.mjs", import.meta.url);
const guard = async () => {
  assert.ok(existsSync(url), "mock migration precondition guard is required");
  return import(url.href);
};
const empty = () => ({mock_exams:0,mock_exam_questions:0,mock_attempts:0,mock_answers:0,monthly_rankings:0});

test("unused mock tables can be migrated without changing the counts", async () => {
  const { assertEmptyMockTables } = await guard();
  const counts = empty();
  assert.doesNotThrow(() => assertEmptyMockTables(counts));
  assert.deepEqual(counts, empty());
});
for (const table of Object.keys(empty())) {
  test(`a nonempty ${table} prevents migration, even when every other table is empty`, async () => {
    const { assertEmptyMockTables } = await guard();
    assert.throws(() => assertEmptyMockTables({...empty(),[table]:1}),e=>e.code==="mock_data_exists");
  });
}
test("missing or malformed counts are never mistaken for an unused database", async () => {
  const { assertEmptyMockTables } = await guard();
  for (const counts of [null,{}, {...empty(),mock_answers:undefined}, {...empty(),mock_answers:-1}, {...empty(),mock_answers:NaN}, {...empty(),mock_answers:"0"}]) {
    assert.throws(() => assertEmptyMockTables(counts));
  }
});
