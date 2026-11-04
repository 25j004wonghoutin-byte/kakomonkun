import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createNotificationClient, applyNotificationReadCutoff, NotificationOwnerChangedError } from "../src/lib/notifications/client.ts";
import { notificationTarget } from "../src/lib/notifications/contract.ts";
const require = createRequire(import.meta.url);
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const flush = () => new Promise(resolve => setImmediate(resolve));
const notice = { id: "owned", type: "title_unlocked", actorName: null, message: "新しい称号の購入条件を達成しました", postId: null, targetMonth: null, readAt: null, createdAt: "2026-11-04T09:00:00.000Z", targetAvailable: true };
const result = { ownerId: "student", updatedCount: 1, unreadCount: 0, readAt: "2026-11-04T10:00:00.000Z" };
const page = { ownerId: "student", notifications: [{ ...notice, readAt: result.readAt }], nextCursor: null, unreadCount: 0 };

// Execute the real component and its lifecycle; substitute only React scheduling,
// routing and network so these tests do not require a second renderer or server.
function component(path, name, props, client, send, window = new EventTarget()) {
  const states = [], refs = [], effects = []; let stateIndex = 0, refIndex = 0, effectIndex = 0, output;
  let rememberedIdentity = { id: props.ownerId ?? "student" };
  const refreshes = [];
  const hooks = {
    useState(initial) { const index = stateIndex++; if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial; return [states[index], value => { states[index] = typeof value === "function" ? value(states[index]) : value; }]; },
    useRef(initial) { const index = refIndex++; return refs[index] ??= { current: initial }; },
    useEffect(run, deps) { const index = effectIndex++, previous = effects[index]; if (!previous || deps?.some((value, i) => value !== previous.deps?.[i])) effects[index] = { run, deps, pending: true, cleanup: previous?.cleanup }; },
  };
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
  const exports = {};
  const navigation = [];
  const router = { refresh() { refreshes.push(true); }, push(value) { navigation.push(value); } };
  vm.runInNewContext(outputText, { exports, window, fetch: send, AbortController, Intl, Date, DOMException, queueMicrotask, require(id) {
    if (id === "react") return hooks;
    if (id === "next/navigation") return { useRouter: () => router, usePathname: () => "/notifications" };
    if (id === "next/link") return { default: "a" };
    if (id === "@/lib/notifications/client") return { notificationClient: client, applyNotificationReadCutoff, NotificationOwnerChangedError };
    if (id === "@/components/student-identity-provider") return { useRememberedStudentIdentity: () => ({ identity: rememberedIdentity, signedOut: rememberedIdentity === null }) };
    if (id === "@/lib/notifications/contract") return { notificationTarget };
    return require(id);
  } }, { filename: path });
  const render = () => { stateIndex = refIndex = effectIndex = 0; output = exports[name](props); return output; };
  const commit = () => { for (const effect of effects) if (effect.pending) { effect.cleanup?.(); effect.pending = false; effect.cleanup = effect.run(); } };
  render();
  return { render, commit, replay() { for (const effect of effects) effect.pending = true; commit(); }, navigation, refreshes, setIdentity(id) { rememberedIdentity = id === null ? null : { id }; }, window, View: exports.NotificationListView, cleanup() { for (const effect of effects) effect.cleanup?.(); } };
}
const inbox = (client, send, window) => component("../src/app/notifications/notification-list.tsx", "OwnedNotificationList", { ownerId: "student", initialNotifications: [notice], initialNextCursor: null, initialUnreadCount: 1 }, client, send, window);

test("only real inbox mount triggers bulk PATCH; successful mount clears visible unread", async () => {
  const sent = [], send = async (url, options = {}) => { sent.push([url, options.method ?? "GET"]); return Response.json(url.endsWith("read-all") ? result : page); };
  const ui = inbox(createNotificationClient(send), send);
  assert.deepEqual(sent, []); ui.commit(); await flush();
  assert.deepEqual(sent, [["/api/notifications/read-all", "PATCH"], ["/api/notifications", "GET"]]);
  const view = ui.render(); assert.equal(view.props.notifications[0].readAt, result.readAt); assert.equal(view.props.unreadCount, 0);
  await view.props.onSelect(view.props.notifications[0]); assert.deepEqual(ui.navigation, ["/titles"]);
  ui.cleanup();
});

test("bulk failure remains visibly unread and the retry control can recover", async () => {
  let attempts = 0;
  const send = async url => { if (url.endsWith("read-all")) return ++attempts === 1 ? Response.json({ error: "offline" }, { status: 500 }) : Response.json(result); return Response.json(page); };
  const ui = inbox(createNotificationClient(send), send); ui.commit(); await flush();
  let view = ui.render(); assert.equal(view.props.notifications[0].readAt, null); assert.equal(view.props.unreadCount, 1); assert.ok(view.props.errorMessage);
  assert.equal(typeof view.props.onRetry, "function");
  const html = renderToStaticMarkup(React.createElement(ui.View, view.props)); assert.match(html, /role="alert"/); assert.match(html, /再試行/);
  view.props.onRetry(); ui.render(); ui.commit(); await flush();
  view = ui.render(); assert.equal(view.props.errorMessage, null); assert.equal(view.props.notifications[0].readAt, result.readAt); assert.equal(attempts, 2); ui.cleanup();
});

test("both mounted bells synchronize from inbox success and ignore a delayed old count", async () => {
  const old = deferred(), sent = [];
  const send = async (url, options = {}) => { sent.push([url, options.method ?? "GET"]); return url.endsWith("unread-count") ? old.promise : Response.json(url.endsWith("read-all") ? result : page); };
  const client = createNotificationClient(send);
  const a = component("../src/components/notification-bell.tsx", "NotificationBell", { ownerId: "student" }, client, send), b = component("../src/components/notification-bell.tsx", "NotificationBell", {}, client, send);
  a.commit(); b.commit(); const ui = inbox(client, send); ui.commit(); await flush();
  old.resolve(Response.json({ ownerId: "student", unreadCount: 7 })); await flush();
  assert.equal(a.render().props["aria-label"], "通知"); assert.equal(b.render().props["aria-label"], "通知");
  assert.equal(sent.filter(([url]) => url.endsWith("unread-count")).length, 1);
  ui.cleanup(); a.cleanup(); b.cleanup();
});

test("bfcache restoration marks new unread notifications once and cleanup stops further writes", async () => {
  let writes = 0;
  const send = async url => { if (url.endsWith("read-all")) writes++; return Response.json(url.endsWith("read-all") ? result : page); };
  const ui = inbox(createNotificationClient(send), send); ui.commit(); await flush();
  const restored = new Event("pageshow"); restored.persisted = true; ui.window.dispatchEvent(restored); await flush(); assert.equal(writes, 2);
  ui.cleanup(); ui.window.dispatchEvent(restored); await flush(); assert.equal(writes, 2);
});


test("a failed bulk read stays retryable when the student loads older notifications", async () => {
  const send = async url => url.endsWith("read-all")
    ? Response.json({ error: "offline" }, { status: 500 })
    : Response.json({ ownerId: "student", notifications: [{ ...notice, id: "older" }], nextCursor: null, unreadCount: 2 });
  const client = createNotificationClient(send);
  const ui = component("../src/app/notifications/notification-list.tsx", "OwnedNotificationList", { ownerId: "student", initialNotifications: [notice], initialNextCursor: "older", initialUnreadCount: 2 }, client, send);
  ui.commit(); await flush(); let view = ui.render(); assert.ok(view.props.errorMessage);
  await view.props.onLoadMore(); view = ui.render();
  assert.equal(view.props.notifications.length, 2); assert.ok(view.props.errorMessage); assert.equal(typeof view.props.onRetry, "function"); ui.cleanup();
});


test("an immediate StrictMode remount and ordinary pageshow share one actual opening", async () => {
  const pending = deferred(), sent = [];
  const send = async (url, options = {}) => { sent.push([url, options.method ?? "GET"]); return url.endsWith("read-all") ? pending.promise : Response.json(page); };
  const client = createNotificationClient(send);
  const second = inbox(client, send); second.commit(); second.cleanup(); second.replay(); second.window.dispatchEvent(new Event("pageshow"));
  pending.resolve(Response.json(result)); await flush();
  assert.deepEqual(sent, [["/api/notifications/read-all", "PATCH"], ["/api/notifications", "GET"]]);
  assert.equal(second.render().props.unreadCount, 0); second.cleanup();
});


test("an identity-store owner change immediately masks previous inbox rows and refreshes the page", () => {
  const send = async () => Response.json(page), client = createNotificationClient(send);
  const ui = component("../src/app/notifications/notification-list.tsx", "NotificationList", { ownerId: "student", initialNotifications: [notice], initialNextCursor: "older", initialUnreadCount: 1 }, client, send);
  ui.setIdentity("other-student"); const view = ui.render();
  assert.doesNotMatch(JSON.stringify(view), /新しい称号|owned|older/); ui.commit(); assert.equal(ui.refreshes.length, 1); ui.cleanup();
});

test("a still-mounted bell immediately hides its prior owner's count before owner-change effects", async () => {
  const props = { ownerId: "student" }, send = async () => Response.json({ ownerId: "student", unreadCount: 7 });
  const ui = component("../src/components/notification-bell.tsx", "NotificationBell", props, createNotificationClient(send), send);
  ui.commit(); await flush(); assert.equal(ui.render().props["aria-label"], "通知 未読7件");
  props.ownerId = "other-student"; assert.equal(ui.render().props["aria-label"], "通知"); ui.cleanup();
});


for (const failure of ["owner", "unauthorized"]) {
  test("pagination " + failure + " immediately clears private rows and refreshes authentication", async () => {
    let fail = false;
    const send = async url => {
      if (fail) return failure === "owner" ? Response.json({ ...page, ownerId: "other-student" }) : Response.json({ error: "login" }, { status: 401 });
      return Response.json(url.endsWith("read-all") ? result : { ...page, nextCursor: "older" });
    };
    const ui = inbox(createNotificationClient(send), send); ui.commit(); await flush();
    fail = true; await ui.render().props.onLoadMore();
    assert.doesNotMatch(JSON.stringify(ui.render()), /新しい称号|owned|older/); assert.equal(ui.refreshes.length, 1); ui.cleanup();
  });
}

test("a teacher inbox with no identity cache clears private rows on an initial 401", async () => {
  const send = async () => Response.json({ error: "login" }, { status: 401 });
  const ui = inbox(createNotificationClient(send), send); ui.commit(); await flush();
  assert.doesNotMatch(JSON.stringify(ui.render()), /新しい称号|owned/); assert.equal(ui.refreshes.length, 1); ui.cleanup();
});

test("a bell-only owner mismatch hides its badge and reloads the authenticated page", async () => {
  const window = new EventTarget(); let reloads = 0; window.location = { reload() { reloads++; } };
  const send = async () => Response.json({ ownerId: "other-student", unreadCount: 7 });
  const ui = component("../src/components/notification-bell.tsx", "NotificationBell", { ownerId: "student" }, createNotificationClient(send), send, window);
  ui.commit(); await flush(); assert.equal(ui.render().props["aria-label"], "通知"); assert.equal(reloads, 1); ui.cleanup();
});
