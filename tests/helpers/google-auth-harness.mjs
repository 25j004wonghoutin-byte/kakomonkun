import { createRequire, Module } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const originalLoad = Module._load;
const originalResolve = Module._resolveFilename;
let current;
Module._resolveFilename = function (request, ...args) {
  const target = request.startsWith("@/") ? fileURLToPath(new URL("../../src/" + request.slice(2), import.meta.url)) : request;
  return originalResolve.call(this, target, ...args);
};
Module._extensions[".ts"] = Module._extensions[".tsx"] = function (module, filename) {
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  module._compile(output, filename);
};
Module._load = function (request, ...args) {
  if (request === "@/lib/prisma") return { prisma: { user: { findUnique: (...args) => current.tx.user.findUnique(...args) }, $transaction: run => run(current.tx) } };
  if (request === "@supabase/ssr") return { createServerClient: () => ({ auth: { getClaims: async () => ({ data: { claims: current.claims } }) } }) };
  if (request === "@/lib/supabase/env") return { getSupabaseConfig: () => ({ url: "https://example.supabase.co", publishableKey: "test-only" }) };
  if (request === "@/lib/supabase/server") return { createClient: async () => current.client };
  if (request === "@/lib/dev-auth") return { DEV_AUTH_COOKIE: "dev", isDevTestAuthEnabled: () => false };
  if (request === "@/lib/starter-title") return { ensureStarterTitleForStudent: async (tx, id) => {
    current.writes.push({ kind: "starter", id });
    const user = current.users.find(u => u.id === id);
    if (user.studentProfile) user.studentProfile.currentTitleId ||= "starter-title";
  } };
  return originalLoad.call(this, request, ...args);
};
const auth = require("../../src/lib/auth.ts");
const callback = require("../../src/app/auth/callback/route.ts");

export const googleUser = (email, id = "auth-new") => ({
  id, email, aud: "authenticated", role: "authenticated", created_at: "2026-11-09T00:00:00Z", email_confirmed_at: "2026-11-09T00:00:00Z",
  app_metadata: { provider: "google", providers: ["google"] }, user_metadata: { full_name: "新しい学生", email_verified: true },
});
export const existingUser = (overrides = {}) => ({
  id: "app-existing", authUserId: "auth-existing", email: "legacy@example.com", displayName: "登録済みの学生",
  role: { id: "student-role", name: "student" }, status: "active", deletedAt: null,
  studentProfile: { userId: "app-existing", currentTitleId: "owned-title", totalPoints: 123, bio: "既存の自己紹介" }, teacherProfile: null,
  ...overrides,
});

export function harness({ authUser = googleUser("new@outside.invalid"), users = [], exchangeError = null, signOutError = null, lookupError = null } = {}) {
  current = { users: structuredClone(users), writes: [], signOuts: [], exchanges: [] };
  const state = current;
  state.tx = {
    user: {
      async findUnique({ where }) {
        if (lookupError) throw lookupError;
        return state.users.find(user => Object.entries(where).every(([key, value]) => user[key] === value)) ?? null;
      },
      async findUniqueOrThrow(input) {
        const user = await state.tx.user.findUnique(input);
        if (!user) throw new Error("Fixture user not found"); return user;
      },
      async update({ where, data }) {
        state.writes.push({ kind: "update", data: structuredClone(data) });
        const user = await state.tx.user.findUniqueOrThrow({ where });
        Object.assign(user, data); return user;
      },
      async create({ data }) {
        state.writes.push({ kind: "create", data: structuredClone(data) });
        const user = { ...data, id: "app-new", role: { id: "student-role", name: "student" }, studentProfile: null, teacherProfile: null, status: "active", deletedAt: null };
        state.users.push(user); return user;
      },
    },
    role: { async findUnique() { return { id: "student-role", name: "student" }; } },
    studentProfile: { async create({ data }) {
      state.writes.push({ kind: "profile", data }); const user = state.users.find(u => u.id === data.userId);
      user.studentProfile = { userId: data.userId, currentTitleId: null, totalPoints: 0 }; return user.studentProfile;
    } },
    teacherProfile: { async create({ data }) { state.writes.push({ kind: "teacherProfile", data }); return data; } },
  };
  state.claims = authUser ? { sub: authUser.id } : null;
  state.client = { auth: {
    async getUser() { return { data: { user: authUser }, error: null }; },
    async exchangeCodeForSession(code) { state.exchanges.push(code); return { data: {}, error: exchangeError }; },
    async signOut(options) { state.signOuts.push(options); if (signOutError) throw signOutError; return { error: null }; },
  } };
  return { ...auth, callback: callback.GET, state };
}

export const loadLoginPage = () => require("../../src/app/login/page.tsx").default;
export const loadSessionProxy = () => require("../../src/lib/supabase/proxy.ts").updateSession;
