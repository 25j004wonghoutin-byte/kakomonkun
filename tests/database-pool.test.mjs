import assert from "node:assert/strict";
import test from "node:test";
let configuration = {};
try { configuration = await import("../src/lib/database-pool.ts"); }
catch (cause) { if (cause.code !== "ERR_MODULE_NOT_FOUND") throw cause; }
function getDatabasePoolMax(env) {
  assert.equal(typeof configuration.getDatabasePoolMax, "function", "pool configuration must exist");
  return configuration.getDatabasePoolMax(env);
}

test("the measured conservative default allows two database operations", () => {
  assert.equal(getDatabasePoolMax({}), 2);
});
test("a bounded explicit pool size supports compatibility and capacity tuning", () => {
  for (const size of [1, 2, 3, 5, 10]) assert.equal(getDatabasePoolMax({ KAKOMON_DATABASE_POOL_MAX: String(size) }), size);
});
test("invalid pool sizes fail without leaking connection details", () => {
  for (const value of ["", "0", "-1", "11", "1.5", "3x", " ", "secret-connection"]) {
    assert.throws(() => getDatabasePoolMax({ KAKOMON_DATABASE_POOL_MAX: value }), /^Error: KAKOMON_DATABASE_POOL_MAX must be an integer from 1 to 10$/);
  }
});
