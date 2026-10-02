import type { Prisma } from "../../../prisma/generated/client";
import { getTokyoDate } from "../tokyo-date";
import type { TitleCategory, TitleFacts } from "./contract";
import { maxDateRun, maxPerfectPracticeRun, maxRandomCorrectRun } from "./rules";

const dateOnly = (date: Date) => date.toISOString().slice(0, 10);
const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000;

export async function collectTitleFacts(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date,
): Promise<TitleFacts> {
  const answerSelect = { isCorrect: true, answeredAt: true, question: { select: { category: { select: { code: true } } } } } as const;
  const [profile, daily, random, practiceAnswers, sessions, activities, navigation, owned, boardPostCount, boardCommentCount] = await Promise.all([
    tx.studentProfile.findUnique({ where: { userId }, select: { titleTrackingStartedAt: true } }),
    tx.dailyQaAnswer.findMany({ where: { userId }, select: { ...answerSelect, answerDate: true } }),
    tx.randomQuizAttempt.findMany({ where: { userId, answeredAt: { not: null } }, select: { ...answerSelect, answerDate: true }, orderBy: { answerSequence: "asc" } }),
    tx.practiceAnswer.findMany({ where: { session: { userId } }, select: answerSelect }),
    tx.practiceSession.findMany({ where: { userId, status: "completed" }, select: { questionCount: true, answeredCount: true, correctCount: true }, orderBy: [{ completedAt: "asc" }, { id: "asc" }] }),
    tx.studentActivityDay.findMany({ where: { userId }, select: { activityDate: true, hasAnswered: true } }),
    tx.studentNavigationProgress.findMany({ where: { userId }, select: { roundTrips: true } }),
    tx.userTitle.findMany({ where: { userId }, select: { titleId: true, title: { select: { catalogKey: true } } } }),
    tx.boardPost.count({ where: { authorId: userId } }),
    tx.boardComment.count({ where: { authorId: userId } }),
  ]);

  const categoryCorrect: Record<TitleCategory, number> = { technology: 0, management: 0, strategy: 0 };
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
    answerCount: answers.length,
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
