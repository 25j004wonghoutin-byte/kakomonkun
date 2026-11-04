import test from "node:test";
import assert from "node:assert/strict";
import { promoteRepliedPost, mergeBoardPage } from "../src/lib/board/activity.ts";

const post = (id, createdAt, isPinned = false) => ({ id, createdAt, activityAt: createdAt, isPinned, commentCount: 2 });

test("own reply moves its post beneath pins and increases its count using the server date", () => {
  const posts = [post("pin", "2026-01-01T00:00:00Z", true), post("new", "2026-11-03T00:00:00Z"), post("old", "2026-10-01T00:00:00Z")];
  const updated = promoteRepliedPost(posts, "old", "2026-11-04T00:00:00Z", "all");
  assert.deepEqual(updated.map(item => item.id), ["pin", "old", "new"]);
  assert.equal(updated[1].commentCount, 3);
  assert.equal(updated[1].activityAt, "2026-11-04T00:00:00Z");
  assert.equal(posts[2].commentCount, 2, "React state is not mutated");
});

test("mine timeline orders by reply activity without changing profile creation order", () => {
  const posts = [post("new", "2026-11-03T00:00:00Z"), post("pin", "2026-01-01T00:00:00Z", true)];
  assert.deepEqual(promoteRepliedPost(posts, "pin", "2026-11-04T00:00:00Z", "mine").map(item => item.id), ["pin", "new"]);
});

test("page append keeps one updated copy when live activity moves a post across the cursor", () => {
  const first = [post("a", "2026-11-03T00:00:00Z"), post("b", "2026-11-02T00:00:00Z")];
  const incoming = [{ ...post("a", "2026-11-03T00:00:00Z"), commentCount: 4 }, post("c", "2026-11-01T00:00:00Z")];
  const merged = mergeBoardPage(first, incoming, "all");
  assert.deepEqual(merged.map(item => item.id), ["a", "b", "c"]);
  assert.equal(merged[0].commentCount, 4);
});

test("activity cursors roundtrip in both scopes while rejecting invalid dates", async () => {
  const { encodeBoardCursor, decodeBoardCursor } = await import("../src/lib/board/cursor.ts");
  const row = { id: "00000000-0000-4000-8000-000000000001", createdAt: "2026-01-01T00:00:00Z", activityAt: "2026-11-04T00:00:00Z" };
  assert.deepEqual(decodeBoardCursor("mine", encodeBoardCursor("mine", row)), row);
  assert.equal(decodeBoardCursor("mine", Buffer.from(JSON.stringify({ ...row, activityAt: "bad" })).toString("base64url")), null);
});

for (const scope of ["all", "mine"]) {
  test(`${scope}: append moves a duplicate backward after its latest reply is deleted or hidden`, () => {
    const first = [post("a", "2026-11-04T00:00:00Z"), post("b", "2026-11-03T00:00:00Z")];
    const incoming = [{ ...post("a", "2026-11-01T00:00:00Z"), commentCount: 1 }, post("c", "2026-11-02T00:00:00Z")];
    const merged = mergeBoardPage(first, incoming, scope);
    assert.deepEqual(merged.map(item => item.id), ["b", "c", "a"]);
    assert.equal(merged[2].commentCount, 1);
    assert.deepEqual(first.map(item => item.id), ["a", "b"], "existing state order is unchanged");
    assert.equal(first[0].activityAt, "2026-11-04T00:00:00Z");
  });
}

test("all: append repositions an unpinned duplicate beneath remaining pins and newer activity", () => {
  const first = [post("a", "2026-11-01T00:00:00Z", true), post("pin", "2026-01-01T00:00:00Z", true), post("b", "2026-11-03T00:00:00Z")];
  const incoming = [post("a", "2026-11-01T00:00:00Z"), post("c", "2026-11-02T00:00:00Z")];
  assert.deepEqual(mergeBoardPage(first, incoming, "all").map(item => item.id), ["pin", "b", "c", "a"]);
});

test("merged activity ties use descending IDs while mine ignores fixed priority", () => {
  const first = [post("a", "2026-11-01T00:00:00Z", true)];
  const incoming = [post("b", "2026-11-01T00:00:00Z"), post("c", "2026-11-01T00:00:00Z")];
  assert.deepEqual(mergeBoardPage(first, incoming, "all").map(item => item.id), ["a", "c", "b"]);
  assert.deepEqual(mergeBoardPage(first, incoming, "mine").map(item => item.id), ["c", "b", "a"]);
});
