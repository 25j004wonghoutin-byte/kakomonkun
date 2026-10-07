import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/app/titles/title-shop.tsx", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
});

// Execute the real component effect without installing a second React renderer.
// Only hook scheduling, navigation and the minimal DOM surface are substituted.
function mountDialog({ submitting = false } = {}) {
  const listeners = new Map(), effects = [], selectedUpdates = [];
  const document = { activeElement: null, body: { style: { overflow: "auto" } } };
  const node = (disabled = false) => ({ disabled, focus() { if (!this.disabled) document.activeElement = this; } });
  const close = node(submitting), cancel = node(submitting), confirm = node(submitting), opener = node();
  const buttons = [close, cancel, confirm];
  const dialog = {
    focus() { document.activeElement = this; },
    contains(target) { return target === this || buttons.includes(target); },
    querySelectorAll() { return buttons.filter((button) => !button.disabled); },
  };
  const refs = [{ current: confirm }, { current: dialog }, { current: opener }];
  const values = [null, { title: { id: "title", name: "テスト称号", pricePoints: 0 }, kind: "purchase" }, submitting, "", ""];
  let stateIndex = 0, refIndex = 0;
  const hookReact = {
    useState() { const index = stateIndex++; return [values[index], (value) => { if (index === 1) selectedUpdates.push(value); }]; },
    useRef() { return refs[refIndex++]; },
    useEffect(effect) { effects.push(effect); },
  };
  const exports = {};
  vm.runInNewContext(outputText, {
    exports, document,
    window: { addEventListener(key, handler) { listeners.set(key, handler); }, removeEventListener(key, handler) { if (listeners.get(key) === handler) listeners.delete(key); } },
    requestAnimationFrame(callback) { callback(); },
    require(id) {
      if (id === "react") return hookReact;
      if (id === "next/navigation") return { useRouter: () => ({ refresh() {} }) };
      if (id === "next/link") return { default: () => null };
      if (["@/components/student-shell", "@/components/ui", "@/lib/read-json-response", "@/lib/titles/shop", "./title-shop-parts"].includes(id)) return {};
      return require(id);
    },
  }, { filename: "title-shop.tsx" });
  exports.TitleShop({ initialData: { displayName: "テスト学生", totalPoints: 0, currentTitle: null, titles: [] } });
  const cleanup = effects[0]();
  return {
    document, dialog, close, confirm, opener, listeners, selectedUpdates, cleanup,
    key(key, shiftKey = false) {
      const event = { key, shiftKey, prevented: false, preventDefault() { this.prevented = true; } };
      listeners.get("keydown")(event);
      return event;
    },
  };
}

test("pending purchase focuses the dialog when every button is disabled", () => {
  const ui = mountDialog({ submitting: true });
  assert.equal(ui.document.activeElement, ui.dialog);
  assert.equal(ui.document.body.style.overflow, "hidden");
  ui.cleanup();
});

for (const shiftKey of [false, true]) {
  test(`pending purchase traps ${shiftKey ? "Shift+Tab" : "Tab"} on the dialog`, () => {
    const ui = mountDialog({ submitting: true });
    ui.opener.focus();
    assert.equal(ui.key("Tab", shiftKey).prevented, true);
    assert.equal(ui.document.activeElement, ui.dialog);
    ui.cleanup();
  });
}

test("ready dialog cycles focus between its first and last buttons", () => {
  const ui = mountDialog();
  assert.equal(ui.document.activeElement, ui.confirm);
  assert.equal(ui.key("Tab").prevented, true);
  assert.equal(ui.document.activeElement, ui.close);
  assert.equal(ui.key("Tab", true).prevented, true);
  assert.equal(ui.document.activeElement, ui.confirm);
  ui.cleanup();
});

test("Escape cannot dismiss a pending purchase but restores the opener when ready", () => {
  const pending = mountDialog({ submitting: true });
  pending.key("Escape");
  assert.deepEqual(pending.selectedUpdates, []);
  pending.cleanup();
  const ready = mountDialog();
  ready.key("Escape");
  assert.deepEqual(ready.selectedUpdates, [null]);
  assert.equal(ready.document.activeElement, ready.opener);
  ready.cleanup();
});

test("effect cleanup restores scrolling and removes its keyboard listener", () => {
  const ui = mountDialog({ submitting: true });
  ui.cleanup();
  assert.equal(ui.document.body.style.overflow, "auto");
  assert.equal(ui.listeners.size, 0);
});
