import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadTestConfig } from "../scripts/test-environment.mjs";

// This suite only writes new UUIDs to the strictly guarded dedicated test project.
test("board activity excludes hidden replies, preserves pins, and paginates both timelines", {
  skip: process.env.KAKOMON_RUN_BOARD_DB_TESTS !== "1", timeout: 120_000,
}, async t => {
  const config = loadTestConfig();
  const [{ PrismaClient }, { PrismaPg }] = await Promise.all([
    import("../prisma/generated/client.ts"), import("@prisma/adapter-pg"),
  ]);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.DIRECT_URL,
    ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 1_000, allowExitOnIdle: true }), errorFormat: "minimal" });
  const priorPrisma = globalThis.prisma, priorUrl = process.env.DATABASE_URL;
  const runId = randomUUID(), userIds = [], postIds = [], emails = new Map();
  let usersBefore, postsBefore;
  const stamp = day => new Date(`2099-01-${String(day).padStart(2, "0")}T00:00:00.000Z`);
  try {
    await db.$connect();
    [usersBefore, postsBefore] = await Promise.all([
      db.user.findMany({ select: { id: true, updatedAt: true }, orderBy: { id: "asc" } }),
      db.boardPost.findMany({ select: { id: true, updatedAt: true }, orderBy: { id: "asc" } }),
    ]);
    const role = await db.role.findUniqueOrThrow({ where: { name: "teacher" } });
    for (let i = 0; i < 4; i++) {
      const id = randomUUID(), email = `board-activity-qa-${runId}-${i}@example.invalid`;
      userIds.push(id); emails.set(id, email);
      await db.user.create({ data: { id, email, displayName: `Board QA ${i}`, roleId: role.id,
        ...(i === 2 ? { status: "inactive" } : {}), ...(i === 3 ? { deletedAt: stamp(31) } : {}) } });
    }
    const makePost = async (day, extra = {}) => {
      const id = randomUUID(); postIds.push(id);
      await db.boardPost.create({ data: { id, authorId: userIds[0], body: `Board QA ${runId}`, createdAt: stamp(day), ...extra } });
      return id;
    };
    const pin = await makePost(1, { isPinned: true });
    const replied = await makePost(2);
    const hidden = await makePost(3);
    const ordinary = [];
    for (let day = 4; day <= 27; day++) ordinary.push(await makePost(day));
    const reply = async (postId, authorId, day, deletedAt = null) => db.boardComment.create({ data: { postId, authorId,
      body: `Reply QA ${runId}`, createdAt: stamp(day), deletedAt } });
    const valid = await reply(replied, userIds[1], 29);
    await reply(hidden, userIds[1], 31, stamp(31));
    await reply(hidden, userIds[2], 31);
    await reply(hidden, userIds[3], 31);
    process.env.DATABASE_URL = config.DIRECT_URL; globalThis.prisma = db;
    const { listBoardPosts, getBoardPublicProfile } = await import("../src/lib/board/read.ts");
    const collect = async (scope) => {
      const rows = []; let cursor = null, pages = 0;
      do {
        const result = await listBoardPosts(userIds[0], scope, cursor);
        rows.push(...result.posts); cursor = result.nextCursor;
        assert.ok(++pages <= 100, "pagination must terminate");
      } while (cursor);
      return rows.filter(item => postIds.includes(item.id));
    };
    const all = await collect("all");
    assert.deepEqual(all.map(item => item.id), [pin, replied, ...ordinary.toReversed(), hidden]);
    assert.equal(all.find(item => item.id === replied).activityAt, stamp(29).toISOString());
    assert.equal(all.find(item => item.id === hidden).commentCount, 0);
    assert.equal(new Set(all.map(item => item.id)).size, postIds.length);
    const mine = await collect("mine");
    assert.deepEqual(mine.map(item => item.id), [replied, ...ordinary.toReversed(), hidden, pin]);
    let profileCursor = null; const profilePosts = [];
    do {
      const profile = await getBoardPublicProfile(userIds[0], userIds[0], profileCursor);
      profilePosts.push(...profile.posts); profileCursor = profile.nextCursor;
    } while (profileCursor);
    assert.deepEqual(profilePosts.map(item => item.id), [...ordinary.toReversed(), hidden, replied, pin]);
    await db.boardComment.update({ where: { id: valid.id }, data: { deletedAt: stamp(31) } });
    assert.deepEqual((await collect("mine")).map(item => item.id), [...ordinary.toReversed(), hidden, replied, pin]);
    // A whole page of equal activity dates must continue using activity + UUID,
    // even when each parent post was created on a different date.
    for (const id of ordinary) await reply(id, userIds[1], 30);
    const tied = [...ordinary].sort().reverse();
    assert.deepEqual((await collect("all")).map(item => item.id), [pin, ...tied, hidden, replied]);
    assert.deepEqual((await collect("mine")).map(item => item.id), [...tied, hidden, replied, pin]);
  } finally {
    try {
      const owned = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } });
      for (const user of owned) assert.equal(user.email, emails.get(user.id), "exact cleanup identity guard");
      await db.$transaction(async tx => {
        await tx.boardComment.deleteMany({ where: { postId: { in: postIds }, authorId: { in: userIds } } });
        await tx.boardPost.deleteMany({ where: { id: { in: postIds }, authorId: userIds[0] ?? randomUUID() } });
        await tx.user.deleteMany({ where: { id: { in: owned.map(user => user.id) }, email: { in: [...emails.values()] } } });
      });
      assert.equal(await db.boardPost.count({ where: { id: { in: postIds } } }), 0);
      assert.equal(await db.user.count({ where: { id: { in: userIds } } }), 0);
      if (usersBefore) assert.deepEqual(await db.user.findMany({ select: { id: true, updatedAt: true }, orderBy: { id: "asc" } }), usersBefore);
      if (postsBefore) assert.deepEqual(await db.boardPost.findMany({ select: { id: true, updatedAt: true }, orderBy: { id: "asc" } }), postsBefore);
      t.diagnostic(`Cleanup verified: ${userIds.length} owned temporary users and ${postIds.length} posts removed; existing rows unchanged.`);
    } finally {
      globalThis.prisma = priorPrisma;
      if (priorUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = priorUrl;
      await db.$disconnect();
    }
  }
});
