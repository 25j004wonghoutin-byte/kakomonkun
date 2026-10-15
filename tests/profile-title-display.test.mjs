import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import "./helpers/register-title-tests.mjs";

registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(["next/link", "next/navigation"].includes(specifier) ? `${specifier}.js` : specifier, context);
  },
});
const { ProfileDashboard } = await import("../src/app/profile/profile-dashboard.tsx");
const { PathnameContext } = await import("next/dist/shared/lib/hooks-client-context.shared-runtime.js");

const ownedTitles = Array.from({ length: 8 }, (_, index) => ({
  id: `title-${index + 1}`, name: `検証称号${index + 1}`, description: null, rarity: "normal",
  purchasedAt: "2026-10-01T00:00:00.000Z", equippedAt: index === 1 ? "2026-10-01T00:00:00.000Z" : null,
}));
function render(titles = ownedTitles, currentTitle = titles[1] ?? null) {
  return renderToStaticMarkup(React.createElement(PathnameContext.Provider, { value: "/profile" }, React.createElement(ProfileDashboard, { initialData: {
    profile: { displayName: "検証学生", avatarUrl: null, bio: "自己紹介", totalPoints: 9, currentTitle },
    stats: { totalPracticeCount: 0, totalCorrectCount: 0, totalAnswerCount: 0, overallAccuracy: 0,
      monthPracticeCount: 0, monthCorrectCount: 0, monthAnswerCount: 0, monthAccuracy: 0,
      previousMonthAccuracy: null, monthPoints: 0 },
    categoryStats: [], ownedTitles: titles, recentActivities: [], pointHistory: [],
  } })));
}
function titleCard(html) {
  const card = html.match(/<section\b[^>]*aria-labelledby="titles-heading"[\s\S]*?<\/section>/)?.[0];
  assert.ok(card, "the title card must render");
  return card;
}

// Restoring the owned-title preview would expose unequipped names and fail this test.
test("the profile title card displays only the equipped title and retains its controls", () => {
  const card = titleCard(render());
  assert.match(card, /現在の称号/);
  assert.match(card, /検証称号2/);
  assert.doesNotMatch(card, /検証称号1|検証称号3|検証称号8|装備中/);
  assert.match(card, /8 個所持/);
  assert.match(card, /称号を変更/);
  assert.match(card, /href="\/titles"/);
});

// Slicing the picker to five entries would make the remaining titles inaccessible.
test("the title picker retains every owned title including entries beyond the fifth", () => {
  const html = render();
  const dialog = html.match(/<dialog\b[^>]*aria-labelledby="title-equip-heading"[\s\S]*?<\/dialog>/)?.[0];
  assert.ok(dialog);
  assert.equal((dialog.match(/aria-pressed=/g) ?? []).length, 8);
  assert.equal((dialog.match(/aria-pressed="true"/g) ?? []).length, 1);
  for (const title of ownedTitles) assert.ok(dialog.includes(title.name));
});

test("a student without owned titles sees the unequipped state and cannot open the picker", () => {
  const card = titleCard(render([], null));
  assert.match(card, /称号未装備/);
  assert.match(card, /<button\b[^>]*disabled=""[^>]*>称号を変更<\/button>/);
  assert.match(card, /href="\/titles"/);
});
