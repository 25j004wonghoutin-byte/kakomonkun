export function createAvatarMemory(initial = null) {
  const state = { avatarUrl: initial, activeStudent: true, points: 42, bio: "自己紹介", displayName: "学生", title: "はじめの一歩", notifications: 0 };
  const objects = new Map();
  const events = [];
  const hooks = {};
  const repository = {
    async current() { return { avatarUrl: state.avatarUrl, activeStudent: state.activeStudent }; },
    async replace(userId, expected, next) {
      events.push(["replace", next]);
      if (hooks.replace) return hooks.replace(userId, expected, next);
      if (!state.activeStudent) return "denied";
      if (next === null && state.avatarUrl === null) return "updated";
      if (state.avatarUrl !== expected) return "conflict";
      state.avatarUrl = next;
      return "updated";
    },
    async unreferencedAfterLock(ref) {
      events.push(["check", ref.key]);
      if (hooks.check) return hooks.check(ref);
      return state.avatarUrl !== ref.url;
    },
  };
  const storage = {
    async put(key, bytes) { events.push(["put", key]); if (hooks.put) await hooks.put(key); objects.set(key, bytes); },
    async get(key) { events.push(["get", key]); return objects.get(key) ?? null; },
    async remove(key) { events.push(["remove", key]); if (hooks.remove) await hooks.remove(key); objects.delete(key); },
    async *list() { for (const key of objects.keys()) yield { key, createdAt: new Date("2026-10-10T00:00:00Z") }; },
  };
  const logs = [];
  return { state, objects, events, hooks, repository, storage, log: (event, ref) => logs.push([event, ref.key]), logs };
}
