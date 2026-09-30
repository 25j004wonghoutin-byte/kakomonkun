import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const boardPages = [
  "src/app/board/page.tsx",
  "src/app/board/posts/[postId]/page.tsx",
  "src/app/board/users/[userId]/page.tsx",
];

test("board pages select their shell from the authenticated role", () => {
  for (const page of boardPages) {
    const source = readFileSync(page, "utf8");

    assert.match(source, /import \{ RoleShell \} from "@\/components\/role-shell"/);
    assert.match(source, /<RoleShell/);
    assert.match(source, /roleName=\{user\.role\.name\}/);
    assert.match(source, /userName=\{user\.displayName\}/);
    assert.doesNotMatch(source, /StudentShell/);
  }
});
