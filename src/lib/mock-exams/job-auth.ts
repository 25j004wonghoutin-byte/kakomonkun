import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "../../../prisma/generated/client";
import { MockError, type MockClock } from "./contract";
import { readMockEnvironment } from "./environment";
import { dbNow } from "./locks";
import { mockHeaders } from "./handlers";
import { getTokyoDate } from "../tokyo-date";

type JobConfig = { secret: string; projectRef: string; environment: "test" | "production" };
const path = "/api/internal/mock-exams/tick";
const denied = () => new MockError("invalid_job_signature", 401, "自動処理の認証を確認してください。");
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export async function verifyMockJobRequest(request: Request, config: JobConfig, now: Date): Promise<{ nonce: string }> {
  if (!/^[a-zA-Z0-9_-]{32,256}$/.test(config.secret) || !["test", "production"].includes(config.environment)
    || config.projectRef !== (config.environment === "test" ? "grzylombpqmidltnbwhx" : "ckgoikdjhtklhbzdgxxs"))
    throw new MockError("job_configuration", 503, "自動処理の設定を確認してください。");
  const url = new URL(request.url), time = request.headers.get("x-mock-time") ?? "", nonce = request.headers.get("x-mock-nonce") ?? "", signature = request.headers.get("x-mock-signature") ?? "";
  if (request.method !== "POST" || url.pathname !== path || url.search || url.hash || !/^[0-9]{1,12}$/.test(time)
    || !uuid.test(nonce) || !/^[0-9a-f]{64}$/.test(signature) || request.headers.get("x-mock-project") !== config.projectRef
    || request.headers.get("x-mock-environment") !== config.environment || !Number.isFinite(+now) || Math.abs(Math.floor(+now / 1000) - Number(time)) > 60
    || request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw denied();
  // 固定本文以外を受け付けず、大きな本文を読み切らない。
  const reader = request.body?.getReader(); if (!reader) throw denied();
  const chunks: Uint8Array[] = []; let length = 0;
  try { for (;;) { const result = await reader.read(); if (result.done) break; length += result.value.length; if (length > 64) { await reader.cancel(); throw denied(); } chunks.push(result.value); } }
  finally { reader.releaseLock(); }
  const raw = Buffer.concat(chunks);
  if (!raw.equals(Buffer.from('{"action":"tick"}'))) throw denied();
  const canonical = `POST\n${path}\n${config.projectRef}\n${config.environment}\n${time}\n${nonce}\n${createHash("sha256").update(raw).digest("hex")}`;
  const expected = createHmac("sha256", config.secret).update(canonical).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) throw denied();
  return { nonce };
}

export async function consumeMockJobNonce(db: PrismaClient, nonce: string, now: Date): Promise<void> {
  if (!uuid.test(nonce) || !Number.isFinite(+now)) throw denied();
  const inserted = await db.mockExamJobRun.createMany({ data: [{ jobKey: `mock-dispatch:${nonce}`, kind: "dispatch", targetMonth: new Date(`${getTokyoDate(now).slice(0, 7)}-01`), status: "completed", completedAt: now, createdAt: now }], skipDuplicates: true });
  if (inserted.count !== 1) throw new MockError("job_replayed", 409, "この自動処理要求は受理済みです。");
}

export function createMockJobHandler({ database, environment = () => process.env, clock = dbNow, run }: {
  database: () => Promise<PrismaClient>; environment?: () => NodeJS.ProcessEnv; clock?: MockClock;
  run?: (db: PrismaClient, clock: MockClock) => Promise<{ processed: number; failed: number; remaining: boolean }>;
}) {
  return async (request: Request): Promise<Response> => {
    try {
      // 通常ログインだけの要求はDBに触れる前に拒否する。
      if (!request.headers.has("x-mock-signature")) throw denied();
      const env = environment(), db = await database(), now = await db.$transaction(clock, { maxWait: 10000, timeout: 30000 });
      const { nonce } = await verifyMockJobRequest(request, { secret: env.KAKOMON_MOCK_JOB_SECRET ?? "", projectRef: env.KAKOMON_MOCK_PROJECT_REF ?? "", environment: env.KAKOMON_MOCK_ENVIRONMENT as JobConfig["environment"] }, now);
      await consumeMockJobNonce(db, nonce, now);
      const flags = readMockEnvironment(env);
      if (!flags.enabled || !flags.jobsEnabled) throw new MockError("jobs_disabled", 503, "自動処理は停止中です。");
      return Response.json(await (run ?? (await import("./jobs")).runMockJobs)(db, clock), { headers: mockHeaders });
    } catch (cause) {
      return Response.json({ error: cause instanceof MockError ? cause.message : "自動処理を完了できませんでした。", code: cause instanceof MockError ? cause.code : "internal_error" }, { status: cause instanceof MockError ? cause.status : 500, headers: mockHeaders });
    }
  };
}
