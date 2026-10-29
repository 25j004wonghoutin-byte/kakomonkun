import type { Prisma } from "../../../prisma/generated/client";
import { getTokyoDate } from "../tokyo-date";
import type { TitleCategory, TitleFacts } from "./contract";
import { maxDateRun, maxPerfectPracticeRun, maxRandomCorrectRun } from "./rules";
import { readMockEnvironment } from "../mock-exams/environment";
import { readTitleHistory } from "./history";

const dateOnly = (date: Date) => date.toISOString().slice(0, 10);
const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000;

export async function collectTitleFacts(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date,
  options?: { mockExamsEnabled: boolean },
): Promise<TitleFacts> {
  return collectFacts(tx, userId, now, () => readStableFacts(tx, userId, options));
}

/** Only share history within one locked activity transaction; days and navigation stay fresh. */
export function createActivityTitleFactsReader(tx: Prisma.TransactionClient, userId: string, now: Date) {
  let history: ReturnType<typeof readStableFacts> | undefined;
  return () => collectFacts(tx, userId, now, () => history ??= readStableFacts(tx, userId));
}

async function readStableFacts(tx: Prisma.TransactionClient, userId: string, options?: { mockExamsEnabled: boolean }) {
  return readTitleHistory(tx, userId, options?.mockExamsEnabled ?? readMockEnvironment(process.env).enabled);
}

async function collectFacts(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date,
  readHistory: () => ReturnType<typeof readStableFacts>,
): Promise<TitleFacts> {
  const [history, activities, navigation] = await Promise.all([
    readHistory(),
    tx.studentActivityDay.findMany({ where: { userId }, select: { activityDate: true, hasAnswered: true } }),
    tx.studentNavigationProgress.findMany({ where: { userId }, select: { roundTrips: true } }),
  ]);
  const { profile, daily, random, practiceAnswers, sessions, owned, boardPostCount, boardCommentCount, mock, ranking } = history;

  const categoryCorrect: Record<TitleCategory, number> = { ...mock.categoryCorrect };
  const answers = [...daily, ...random, ...practiceAnswers];
  for (const answer of answers) {
    const code = answer.question.category.code;
    if (answer.isCorrect && (code === "technology" || code === "management" || code === "strategy")) categoryCorrect[code]++;
  }
  const answerDays = new Set([
    ...daily.map((answer) => dateOnly(answer.answerDate)),
    ...random.flatMap((answer) => answer.answerDate ? [dateOnly(answer.answerDate)] : []),
    ...practiceAnswers.map((answer) => getTokyoDate(answer.answeredAt)),
  ]);
  const usage = new Map(activities.map((day) => [dateOnly(day.activityDate), day.hasAnswered || answerDays.has(dateOnly(day.activityDate))]));
  // 過去の実回答は利用の肯定的な証拠。欠落日は未利用の証拠にはしない。
  for (const day of answerDays) usage.set(day, true);
  const today = getTokyoDate(now);
  const trackingDay = profile?.titleTrackingStartedAt ? getTokyoDate(profile.titleTrackingStartedAt) : null;
  let noAnswerActivityMaxRun = 0;
  let returnGapMaxDays = 0;
  let hasAnswerRunThenBreak = false;
  if (trackingDay !== null) {
    // 初日の未観測部分と、まだ閉じていない当日は無回答日から除く。
    noAnswerActivityMaxRun = maxDateRun([...usage].filter(([day, hasAnswered]) => day > trackingDay && day < today && !hasAnswered).map(([day]) => day));
    const observedDates = [...new Set([...usage.keys()].filter((day) => day >= trackingDay && day <= today).concat(today))].sort();
    let previous: string | undefined;
    let answerRun = 0;
    for (const day of observedDates) {
      if (previous !== undefined) {
        const gap = dayNumber(day) - dayNumber(previous);
        returnGapMaxDays = Math.max(returnGapMaxDays, gap);
        if (gap > 1 && answerRun >= 3) hasAnswerRunThenBreak = true;
        if (gap !== 1) answerRun = 0;
      }
      answerRun = usage.get(day) === true ? answerRun + 1 : 0;
      previous = day;
    }
  }
  const complete = sessions.filter((session) => session.questionCount > 0 && session.answeredCount === session.questionCount);
  const ownedKeys = owned.flatMap((item) => item.title.catalogKey ? [item.title.catalogKey] : []);
  return {
    ranking,
    answerCount: answers.length+mock.answerCount,
    categoryCorrect,
    dailyAnswerMaxRun: maxDateRun(daily.map((answer) => dateOnly(answer.answerDate))),
    dailyIncorrectMaxRun: maxDateRun(daily.filter((answer) => !answer.isCorrect).map((answer) => dateOnly(answer.answerDate))),
    hasCompletedPractice: complete.length > 0,
    hasPerfect60: complete.some((session) => session.questionCount === 60 && session.correctCount === 60),
    hasZero60: complete.some((session) => session.questionCount === 60 && session.correctCount === 0),
    perfectPracticeMaxRun: maxPerfectPracticeRun(sessions),
    randomCorrectMaxRun: maxRandomCorrectRun(random.flatMap((answer) => answer.answerDate && answer.isCorrect !== null ? [{ answerDate: dateOnly(answer.answerDate), isCorrect: answer.isCorrect }] : [])),
    activityMaxRun: maxDateRun([...usage.keys()]),
    noAnswerActivityMaxRun,
    hasAnswerRunThenBreak,
    returnGapMaxDays,
    navigationRoundTrips: navigation.reduce((sum, row) => sum + row.roundTrips, 0),
    boardPostCount,
    boardCommentCount,
    ownedCountExcludingCollector: owned.filter((item) => item.title.catalogKey !== "v1-022").length,
    ownedKeys,
    nameChanged: false,
  };
}
