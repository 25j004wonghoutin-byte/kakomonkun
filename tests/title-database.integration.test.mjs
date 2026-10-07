import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { loadTestConfig } from "../scripts/test-environment.mjs";

// 専用テストDBだけを使用する。通常実行では接続せず、明示指定時だけ一時データを作る。
test("title services serialize real database writes and roll back notification failures", {
  skip: process.env.KAKOMON_RUN_DB_QA !== "1",
  timeout: 180_000,
}, async (t) => {
  const config = loadTestConfig(); // Strict project/URL guard; no process.env or production fallback.
  const [{ PrismaClient }, { PrismaPg }, purchase, random, learning, unlocks, { TITLE_CATALOG }] = await Promise.all([
    import("../prisma/generated/client.ts"),
    import("@prisma/adapter-pg"),
    import("../src/lib/titles/purchase.ts"),
    import("../src/lib/titles/random-attempts.ts"),
    import("../src/lib/titles/learning-events.ts"),
    import("../src/lib/titles/unlocks.ts"),
    import("../src/lib/titles/catalog.ts"),
  ]);
  // Independent session-pooler connections are essential: a single max=1 client only tests its queue.
  const clients = [0, 1].map(() => new PrismaClient({
    adapter: new PrismaPg({
      connectionString: config.DIRECT_URL,
      ssl: { rejectUnauthorized: false },
      max: 1,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 10_000,
      allowExitOnIdle: true,
    }),
    errorFormat: "minimal",
  }));
  const [db, other] = clients;
  const createdUsers = new Map();
  const createdSessions = new Set();
  const runId = randomUUID();
  const now = new Date("2026-10-07T03:00:00.000Z");
  const txOptions = { maxWait: 10_000, timeout: 30_000 };
  const transact = (client, operation) => client.$transaction(operation, txOptions);
  const student = (id) => ({ id, isStudent: true });
  let masterBefore;
  let existingUsers;

  function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
  }

  // Hold the winner after its actual service writes. Release only after PostgreSQL confirms
  // the second backend is blocked by that transaction, rather than relying on a sleep.
  async function contend(context, firstOperation, secondOperation) {
    const held = deferred();
    const started = deferred();
    const beginSecond = deferred();
    const release = deferred();
    const first = transact(db, async (tx) => {
      const [{ pid }] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
      const value = await firstOperation(tx);
      held.resolve({ tx, pid });
      await release.promise;
      return value;
    });
    first.catch(held.reject);
    let second;
    let observationError;
    try {
      const holder = await held.promise;
      let secondSettled = false;
      second = transact(other, async (tx) => {
        const [{ pid }] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
        started.resolve(pid);
        await beginSecond.promise;
        return secondOperation(tx);
      });
      second.then(() => { secondSettled = true; }, (error) => {
        secondSettled = true;
        started.reject(error);
      });
      const waitingPid = await started.promise;
      assert.notEqual(waitingPid, holder.pid, "transactions must use different PostgreSQL backends");
      // Prime a statistics snapshot before the loser starts its locking SQL. This makes
      // stale current-query caching reproducible rather than dependent on network timing.
      await holder.tx.$queryRaw`
        SELECT query FROM pg_stat_activity WHERE pid = ${waitingPid}::integer
      `;
      beginSecond.resolve();
      const deadline = Date.now() + 5_000;
      let blocked = false;
      let lastObservation;
      while (Date.now() < deadline && !secondSettled) {
        // pg_stat_activity caches current-query information for the transaction, while
        // lock state can change. Discard that snapshot before each observation.
        await holder.tx.$executeRaw`SELECT pg_stat_clear_snapshot()`;
        const rows = await holder.tx.$queryRaw`
          SELECT pg_blocking_pids(${waitingPid}::integer) AS blockers,
            wait_event_type AS "waitType", query AS "waitingQuery"
          FROM pg_stat_activity WHERE pid = ${waitingPid}::integer
        `;
        lastObservation = rows[0] ?? null;
        if (lastObservation?.blockers.includes(holder.pid) && lastObservation.waitType === "Lock"
          && /public\.users[\s\S]*FOR NO KEY UPDATE/i.test(lastObservation.waitingQuery ?? "")) {
          blocked = true;
          break;
        }
      }
      assert.equal(blocked, true,
        `loser must wait on the winner's user row lock; last observation: ${JSON.stringify(lastObservation)}`);
      context.diagnostic(`database overlap: backend ${waitingPid} waits on backend ${holder.pid} (users FOR NO KEY UPDATE)`);
    } catch (error) {
      observationError = error;
    } finally {
      beginSecond.resolve();
      release.resolve();
    }
    const results = await Promise.allSettled([first, ...(second ? [second] : [])]);
    if (observationError) throw observationError;
    return results;
  }

  async function makeUser(label, totalPoints = 0) {
    const id = randomUUID();
    const email = `title-db-qa-${runId}-${label}@example.invalid`;
    createdUsers.set(id, email);
    await db.user.create({ data: {
      id, email, displayName: `DB検証 ${label}`, roleId: role.id,
      studentProfile: { create: { totalPoints } },
    } });
    return id;
  }

  async function makeAttempt(userId) {
    return db.randomQuizAttempt.create({ data: { id: randomUUID(), userId, questionId: question.id, issuedAt: now } });
  }

  async function makePractice(userId, answeredCount) {
    const id = randomUUID();
    createdSessions.add(id);
    return transact(db, async (tx) => {
      await tx.practiceSession.create({ data: {
        id, userId, examId: question.examId, questionCount: 30,
        answeredCount, correctCount: answeredCount, startedAt: now,
      } });
      await tx.practiceSessionQuestion.createMany({ data: questions.map((item, index) => ({
        sessionId: id, questionId: item.id, orderNo: index + 1,
      })) });
      if (answeredCount > 0) await tx.practiceAnswer.createMany({ data: questions.slice(0, answeredCount).map((item, index) => ({
        sessionId: id, questionId: item.id, selectedChoiceId: item.choices[0].id,
        isCorrect: true, orderNo: index + 1, answeredAt: now,
      })) });
      return id;
    });
  }

  async function snapshot(client, userId) {
    const [profile, owned, points, attempts, sessions, answers, activity, unlocked, notifications] = await Promise.all([
      client.studentProfile.findUnique({ where: { userId } }),
      client.userTitle.findMany({ where: { userId }, orderBy: { titleId: "asc" } }),
      client.pointTransaction.findMany({ where: { userId }, orderBy: { id: "asc" } }),
      client.randomQuizAttempt.findMany({ where: { userId }, orderBy: { id: "asc" } }),
      client.practiceSession.findMany({ where: { userId }, orderBy: { id: "asc" } }),
      client.practiceAnswer.findMany({ where: { session: { userId } }, orderBy: { id: "asc" } }),
      client.studentActivityDay.findMany({ where: { userId }, orderBy: { activityDate: "asc" } }),
      client.userTitleUnlock.findMany({ where: { userId }, orderBy: { titleId: "asc" } }),
      client.notification.findMany({ where: { recipientId: userId }, orderBy: { id: "asc" } }),
    ]);
    return { profile, owned, points, attempts, sessions, answers, activity, unlocked, notifications };
  }

  // Execute the real notification INSERT, inspect earlier writes on this transaction, then throw.
  // The proxy changes no production service and the post-failure snapshot is read from the DB.
  async function expectRollback(userId, operation, inspectWrites) {
    const before = await snapshot(db, userId);
    let injected = false;
    await assert.rejects(transact(db, async (tx) => {
      const failing = new Proxy(tx, {
        get(target, property) {
          if (property !== "notification") return Reflect.get(target, property);
          return new Proxy(target.notification, {
            get(delegate, method) {
              if (method !== "createMany") return Reflect.get(delegate, method);
              return async (args) => {
                const inserted = await delegate.createMany(args);
                assert.ok(inserted.count > 0, "real notification rows must exist before injected failure");
                const inside = await snapshot(tx, userId);
                assert.ok(inside.unlocked.length > before.unlocked.length);
                assert.ok(inside.notifications.length > before.notifications.length);
                await inspectWrites(inside);
                injected = true;
                throw new Error("QA injected notification failure");
              };
            },
          });
        },
      });
      await operation(failing);
    }), /^Error: QA injected notification failure$/);
    assert.equal(injected, true, "fault injection must be reached after real writes");
    assert.deepEqual(await snapshot(other, userId), before, "all user-scoped database writes must roll back");
  }

  let role;
  let titles;
  let paid;
  let question;
  let questions;
  try {
    try { await Promise.all(clients.map((client) => client.$connect())); }
    catch (error) { throw new Error(`Dedicated test DB connection failed (${error.code ?? error.name})`); }
    [role, titles, existingUsers] = await Promise.all([
      db.role.findUniqueOrThrow({ where: { name: "student" } }),
      db.title.findMany({ orderBy: { id: "asc" } }),
      db.user.findMany({ select: { id: true, updatedAt: true }, orderBy: { id: "asc" } }),
    ]);
    masterBefore = titles;
    paid = titles.filter((item) => item.isActive && item.acquisitionKind === "points" && item.pricePoints > 0
      && TITLE_CATALOG.some((definition) => definition.key === item.catalogKey && definition.implemented && definition.acquisitionKind === "points"))
      .sort((left, right) => left.pricePoints - right.pricePoints || left.catalogKey.localeCompare(right.catalogKey));
    assert.ok(paid.length >= 2, "dedicated DB needs two existing paid catalog titles");
    for (const key of ["v1-008", "v1-014", "v1-022", "v1-050"]) {
      assert.ok(titles.some((item) => item.catalogKey === key && item.isActive), `existing condition title ${key} is required`);
    }
    const exam = await db.exam.findFirstOrThrow({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true } });
    questions = await db.question.findMany({
      where: { examId: exam.id, status: "published", deletedAt: null, choices: { some: { isCorrect: true } } },
      select: { id: true, examId: true, choices: { where: { isCorrect: true }, take: 1, select: { id: true } } },
      orderBy: { id: "asc" }, take: 30,
    });
    assert.equal(questions.length, 30, "dedicated DB needs 30 real questions in one exam");
    [question] = questions;
    const last = questions.at(-1);
    const randomValue = (attempt) => ({ attemptId: attempt.id, selectedChoiceId: question.choices[0].id });
    const answerValue = { questionId: last.id, selectedChoiceId: last.choices[0].id };

    await t.test("concurrent purchase of the same paid title debits once", async (context) => {
      const userId = await makeUser("same-purchase", paid[0].pricePoints * 2);
      const results = await contend(context,
        (tx) => purchase.purchaseTitle(tx, userId, paid[0].id, now),
        (tx) => purchase.purchaseTitle(tx, userId, paid[0].id, now));
      assert.equal(results[0].status, "fulfilled");
      assert.equal(results[1].status, "rejected");
      assert.ok(results[1].reason instanceof purchase.TitlePurchaseError);
      assert.equal(results[1].reason.code, "owned");
      const state = await snapshot(db, userId);
      assert.equal(state.owned.length, 1);
      assert.equal(state.points.length, 1);
      assert.equal(state.points[0].points, -paid[0].pricePoints);
      assert.equal(state.profile.totalPoints, paid[0].pricePoints);
    });

    await t.test("concurrent purchases cannot spend an insufficient combined balance", async (context) => {
      const balance = Math.max(paid[0].pricePoints, paid[1].pricePoints);
      const userId = await makeUser("different-purchases", balance);
      const results = await contend(context,
        (tx) => purchase.purchaseTitle(tx, userId, paid[0].id, now),
        (tx) => purchase.purchaseTitle(tx, userId, paid[1].id, now));
      assert.equal(results[0].status, "fulfilled");
      assert.equal(results[1].status, "rejected");
      assert.equal(results[1].reason.code, "insufficient");
      const state = await snapshot(db, userId);
      assert.equal(state.profile.totalPoints, balance - paid[0].pricePoints);
      assert.ok(state.profile.totalPoints >= 0);
      assert.equal(state.owned.length, 1);
      assert.equal(state.points.length, 1);
    });

    await t.test("duplicate random answer writes one sequence and one activity day", async (context) => {
      const userId = await makeUser("duplicate-random");
      const attempt = await makeAttempt(userId);
      const later = new Date(+now + 1_000);
      const results = await contend(context,
        (tx) => random.saveRandomAnswer(tx, userId, randomValue(attempt), now),
        (tx) => random.saveRandomAnswer(tx, userId, randomValue(attempt), later));
      assert.ok(results.every((result) => result.status === "fulfilled"));
      assert.equal(results[0].value.alreadyAnswered, false);
      assert.equal(results[1].value.alreadyAnswered, true);
      const state = await snapshot(db, userId);
      assert.equal(state.attempts.length, 1);
      assert.equal(state.attempts[0].answerSequence, 1);
      assert.equal(+state.attempts[0].answeredAt, +now);
      assert.equal(state.activity.length, 1);
      assert.equal(state.activity[0].hasAnswered, true);
      assert.equal(+state.activity[0].lastSeenAt, +now);
      assert.equal(state.profile.totalPoints, 0);
      assert.equal(state.points.length, 0);
    });

    await t.test("separate concurrent random attempts receive unique serialized sequences", async (context) => {
      const userId = await makeUser("separate-random");
      const first = await makeAttempt(userId);
      const second = await makeAttempt(userId);
      const results = await contend(context,
        (tx) => random.saveRandomAnswer(tx, userId, randomValue(first), now),
        (tx) => random.saveRandomAnswer(tx, userId, randomValue(second), now));
      assert.ok(results.every((result) => result.status === "fulfilled" && !result.value.alreadyAnswered));
      const state = await snapshot(db, userId);
      assert.equal(state.attempts.length, 2);
      assert.equal(state.attempts.find((item) => item.id === first.id).answerSequence, 1);
      assert.equal(state.attempts.find((item) => item.id === second.id).answerSequence, 2);
      assert.equal(state.activity.length, 1);
      assert.equal(state.activity[0].hasAnswered, true);
    });

    await t.test("answer before finish includes all 30 answers and rewards only once", async (context) => {
      const userId = await makeUser("answer-first");
      const sessionId = await makePractice(userId, 29);
      const results = await contend(context,
        (tx) => learning.savePracticeAnswer(tx, student(userId), sessionId, answerValue, now),
        (tx) => learning.finishPracticeSession(tx, student(userId), sessionId, now));
      assert.ok(results.every((result) => result.status === "fulfilled"));
      assert.equal(results[1].value.answeredAllQuestions, true);
      assert.equal(results[1].value.earnedPoints, 8);
      const beforeReplay = await snapshot(db, userId);
      assert.equal(beforeReplay.answers.length, 30);
      assert.equal(beforeReplay.sessions[0].answeredCount, 30);
      assert.equal(beforeReplay.profile.totalPoints, 8);
      assert.equal(beforeReplay.profile.totalPracticeCount, 1);
      assert.equal(beforeReplay.profile.totalCorrectCount, 30);
      assert.equal(beforeReplay.profile.totalAnswerCount, 30);
      assert.deepEqual(beforeReplay.points.map((item) => item.points).sort((a, b) => a - b), [3, 5]);
      assert.equal(beforeReplay.unlocked.length, 1);
      assert.equal(beforeReplay.unlocked[0].titleId, titles.find((item) => item.catalogKey === "v1-008").id);
      assert.equal(beforeReplay.notifications.length, 1);
      const replay = await transact(other, (tx) => learning.finishPracticeSession(tx, student(userId), sessionId, now));
      assert.equal(replay.alreadyCompleted, true);
      assert.deepEqual(await snapshot(db, userId), beforeReplay);
    });

    await t.test("finish before the final answer rejects the answer and repeats no rewards", async (context) => {
      const userId = await makeUser("finish-first");
      const sessionId = await makePractice(userId, 29);
      const results = await contend(context,
        (tx) => learning.finishPracticeSession(tx, student(userId), sessionId, now),
        (tx) => learning.savePracticeAnswer(tx, student(userId), sessionId, answerValue, now));
      assert.equal(results[0].status, "fulfilled");
      assert.equal(results[0].value.earnedPoints, 0);
      assert.equal(results[1].status, "rejected");
      assert.ok(results[1].reason instanceof learning.LearningEventError);
      assert.equal(results[1].reason.status, 409);
      const beforeReplay = await snapshot(db, userId);
      assert.equal(beforeReplay.answers.length, 29);
      assert.equal(beforeReplay.sessions[0].answeredCount, 29);
      assert.equal(beforeReplay.sessions[0].status, "completed");
      assert.equal(beforeReplay.profile.totalPoints, 0);
      assert.equal(beforeReplay.profile.totalPracticeCount, 1);
      assert.equal(beforeReplay.profile.totalAnswerCount, 29);
      assert.equal(beforeReplay.points.length, 0);
      assert.equal(beforeReplay.unlocked.length, 0);
      assert.equal(beforeReplay.notifications.length, 0);
      const replay = await transact(other, (tx) => learning.finishPracticeSession(tx, student(userId), sessionId, now));
      assert.equal(replay.alreadyCompleted, true);
      assert.deepEqual(await snapshot(db, userId), beforeReplay);
    });

    await t.test("concurrent unlock sync inserts one eligibility and one notification", async (context) => {
      const userId = await makeUser("duplicate-unlock");
      const value = { now, source: "event", displayNameChanged: true };
      const results = await contend(context,
        (tx) => unlocks.syncTitleUnlocks(tx, userId, value),
        (tx) => unlocks.syncTitleUnlocks(tx, userId, value));
      assert.ok(results.every((result) => result.status === "fulfilled"));
      assert.deepEqual(results[0].value.newlyUnlockedKeys, ["v1-050"]);
      assert.deepEqual(results[1].value.newlyUnlockedKeys, []);
      const state = await snapshot(db, userId);
      assert.equal(state.unlocked.length, 1);
      assert.equal(state.notifications.length, 1);
      assert.equal(state.owned.length, 0);
      assert.equal(state.points.length, 0);
    });

    await t.test("free eligible purchase and replay preserve balance and equipped title", async () => {
      const userId = await makeUser("free-purchase", 17);
      const equipped = titles.find((item) => item.catalogKey === "v1-014");
      const free = titles.find((item) => item.catalogKey === "v1-050");
      await db.userTitle.create({ data: { userId, titleId: equipped.id, purchasedAt: now } });
      await db.studentProfile.update({ where: { userId }, data: { currentTitleId: equipped.id } });
      await transact(db, (tx) => unlocks.syncTitleUnlocks(tx, userId, { now, source: "event", displayNameChanged: true }));
      const result = await transact(db, (tx) => purchase.purchaseTitle(tx, userId, free.id, now));
      assert.equal(result.title.id, free.id);
      assert.equal(result.totalPoints, 17);
      assert.equal(+result.purchasedAt, +now);
      const beforeReplay = await snapshot(db, userId);
      assert.equal(beforeReplay.owned.length, 2);
      assert.ok(beforeReplay.owned.some((item) => item.titleId === free.id));
      assert.equal(beforeReplay.profile.currentTitleId, equipped.id);
      assert.equal(beforeReplay.profile.totalPoints, 17);
      assert.equal(beforeReplay.points.length, 0);
      assert.equal(beforeReplay.unlocked.length, 1);
      assert.equal(beforeReplay.notifications.length, 1);
      await assert.rejects(transact(other, (tx) => purchase.purchaseTitle(tx, userId, free.id, now)),
        (error) => error instanceof purchase.TitlePurchaseError && error.code === "owned");
      assert.deepEqual(await snapshot(db, userId), beforeReplay);
    });

    await t.test("notification failure rolls back paid ownership, debit, eligibility and notification", async () => {
      const userId = await makeUser("rollback-purchase", paid[0].pricePoints);
      const owned = titles.filter((item) => item.id !== paid[0].id && item.catalogKey !== "v1-022").slice(0, 19);
      assert.equal(owned.length, 19);
      await db.userTitle.createMany({ data: owned.map((item) => ({ userId, titleId: item.id, purchasedAt: now })) });
      await expectRollback(userId,
        (tx) => purchase.purchaseTitle(tx, userId, paid[0].id, now),
        (inside) => {
          assert.equal(inside.owned.length, 20);
          assert.equal(inside.profile.totalPoints, 0);
          assert.equal(inside.points.length, 1);
          assert.equal(inside.points[0].points, -paid[0].pricePoints);
          assert.ok(inside.unlocked.some((item) => item.titleId === titles.find((title) => title.catalogKey === "v1-022").id));
        });
    });

    // These compose the public services in one transaction so the name-change notification
    // fires after the answer AND activity INSERT, proving rollback of both persisted writes.
    const nameChange = { now, source: "event", displayNameChanged: true };
    await t.test("notification failure rolls back a saved random answer, sequence, tracking and activity", async () => {
      const userId = await makeUser("rollback-random");
      const attempt = await makeAttempt(userId);
      await expectRollback(userId, async (tx) => {
        await random.saveRandomAnswer(tx, userId, randomValue(attempt), now);
        await unlocks.syncTitleUnlocks(tx, userId, nameChange);
      }, (inside) => {
        assert.equal(inside.attempts[0].answerSequence, 1);
        assert.equal(inside.attempts[0].isCorrect, true);
        assert.equal(+inside.attempts[0].answeredAt, +now);
        assert.equal(inside.activity.length, 1);
        assert.equal(inside.activity[0].hasAnswered, true);
        assert.equal(+inside.profile.titleTrackingStartedAt, +now);
      });
    });

    await t.test("notification failure rolls back practice answer, session counts, tracking and activity", async () => {
      const userId = await makeUser("rollback-answer");
      const sessionId = await makePractice(userId, 0);
      await expectRollback(userId, async (tx) => {
        await learning.savePracticeAnswer(tx, student(userId), sessionId, answerValue, now);
        await unlocks.syncTitleUnlocks(tx, userId, nameChange);
      }, (inside) => {
        assert.equal(inside.answers.length, 1);
        assert.equal(inside.sessions[0].answeredCount, 1);
        assert.equal(inside.sessions[0].correctCount, 1);
        assert.equal(inside.activity.length, 1);
        assert.equal(inside.activity[0].hasAnswered, true);
        assert.equal(+inside.profile.titleTrackingStartedAt, +now);
      });
    });

    await t.test("notification failure rolls back completion, rewards, profile counters and eligibility", async () => {
      const userId = await makeUser("rollback-finish");
      const sessionId = await makePractice(userId, 30);
      await expectRollback(userId,
        (tx) => learning.finishPracticeSession(tx, student(userId), sessionId, now),
        (inside) => {
          assert.equal(inside.sessions[0].status, "completed");
          assert.equal(inside.sessions[0].earnedPoints, 8);
          assert.equal(inside.profile.totalPoints, 8);
          assert.equal(inside.profile.totalPracticeCount, 1);
          assert.equal(inside.profile.totalAnswerCount, 30);
          assert.equal(inside.profile.totalCorrectCount, 30);
          assert.equal(inside.points.length, 2);
        });
    });
  } finally {
    try {
      // Delete only UUIDs allocated by this run, guarded by their exact unique QA emails.
      const userIds = [...createdUsers.keys()];
      const sessionIds = [...createdSessions];
      if (userIds.length > 0) {
        const remaining = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } });
        for (const user of remaining) assert.equal(user.email, createdUsers.get(user.id), "cleanup identity guard");
        await transact(db, async (tx) => {
          await tx.notification.deleteMany({ where: { OR: [{ recipientId: { in: userIds } }, { actorId: { in: userIds } }] } });
          await tx.user.deleteMany({ where: { id: { in: remaining.map((item) => item.id) } } });
        });
        const counts = await Promise.all([
          db.user.count({ where: { id: { in: userIds } } }),
          ...[db.studentProfile, db.userTitle, db.userTitleUnlock, db.randomQuizAttempt,
            db.studentActivityDay, db.studentNavigationProgress, db.pointTransaction, db.practiceSession]
            .map((model) => model.count({ where: { userId: { in: userIds } } })),
          db.notification.count({ where: { OR: [{ recipientId: { in: userIds } }, { actorId: { in: userIds } }] } }),
          db.practiceAnswer.count({ where: { sessionId: { in: sessionIds } } }),
          db.practiceSessionQuestion.count({ where: { sessionId: { in: sessionIds } } }),
        ]);
        assert.ok(counts.every((count) => count === 0), "all exact QA users and their dependent rows must be removed");
        t.diagnostic(`cleanup verified: ${userIds.length} temporary users, ${sessionIds.length} sessions; 12 table checks returned zero`);
      }
      if (masterBefore) assert.deepEqual(await db.title.findMany({ orderBy: { id: "asc" } }), masterBefore, "catalog must remain unchanged");
      if (existingUsers) assert.deepEqual(await db.user.findMany({ select: { id: true, updatedAt: true }, orderBy: { id: "asc" } }), existingUsers, "existing users must remain unchanged");
    } finally {
      await Promise.all(clients.map((client) => client.$disconnect()));
    }
  }
});
