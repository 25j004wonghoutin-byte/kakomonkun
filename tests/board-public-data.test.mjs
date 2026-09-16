import { test } from "node:test";
import assert from "node:assert/strict";
import { toBoardAuthor } from "../src/lib/board/contract.ts";

test("public author never includes email, points or student number", () => {
  const result = toBoardAuthor({
    id: "u",
    displayName: "みさき",
    email: "private@example.com",
    role: { name: "student" },
    studentProfile: {
      avatarUrl: null,
      bio: "学習中",
      studentNo: "S1",
      totalPoints: 99,
      currentTitle: { name: "コツコツ学習者" },
    },
    teacherProfile: null,
  });

  assert.deepEqual(result, {
    id: "u",
    displayName: "みさき",
    avatarUrl: null,
    titleName: "コツコツ学習者",
    isTeacher: false,
  });
  assert.equal(JSON.stringify(result).includes("private@example.com"), false);
});
