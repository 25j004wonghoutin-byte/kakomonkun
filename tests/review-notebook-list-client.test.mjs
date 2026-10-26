import test from "node:test";
import assert from "node:assert/strict";
import { createReviewListLoader } from "../src/lib/review-notebook/list-loader.ts";
const query = { status: "unfinished", examCode: null, categoryCode: null, sessionId: null, page: 1 };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function setup(fetchList) { const data = [], errors = [], loading = []; return { data, errors, loading, loader: createReviewListLoader({ fetchList, onData: x => data.push(x), onError: x => errors.push(x), onLoading: x => loading.push(x) }) }; }
test("older filter response is ignored", async () => {
  const a = deferred(), b = deferred(); let calls = 0;
  const { data, loader } = setup(() => ++calls === 1 ? a.promise : b.promise);
  const first = loader.load(query), second = loader.load({ ...query, status: "all" });
  b.resolve({ marker: "new" }); await second; a.resolve({ marker: "old" }); await first;
  assert.deepEqual(data.filter(Boolean), [{ marker: "new" }]);
});
test("401 clears previous student data and dispose rejects late private data", async () => {
  const d = deferred(); const { data, errors, loader } = setup(() => d.promise);
  const request = loader.load(query); d.reject(Object.assign(Error("login"), { status: 401 })); await request;
  assert.equal(data.at(-1), null); assert.equal(errors.at(-1).status, 401);
  const next = deferred(); const other = setup(() => next.promise); const pending = other.loader.load(query); other.loader.dispose(); next.resolve({ marker: "private" }); await pending;
  assert.equal(other.data.some(Boolean), false);
});
