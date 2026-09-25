import "server-only";

import { prisma } from "@/lib/prisma";
import { getTokyoMonthRange, getTokyoWeekRange } from "@/lib/tokyo-date";
import {
  listStudentLearningSummaries,
  type StudentLearningSummary,
} from "@/lib/teacher/students";

export type TeacherDashboardData = {
  registeredStudentCount: number;
  activeStudentCountThisMonth: number;
  answerCountThisWeek: number;
  pinnedNoticeCount: number;
  recentStudents: StudentLearningSummary[];
};

const activeStudentWhere = {
  role: { name: "student" },
  status: "active",
  deletedAt: null,
} as const;

export async function getTeacherDashboardData(): Promise<TeacherDashboardData> {
  const month = getTokyoMonthRange();
  const week = getTokyoWeekRange();

  const [
    registeredStudentCount,
    monthlyDailyStudents,
    monthlyPracticeStudents,
    weeklyDailyAnswerCount,
    weeklyPracticeAnswerCount,
    pinnedNoticeCount,
    recentStudentPage,
  ] = await Promise.all([
    prisma.user.count({ where: activeStudentWhere }),
    prisma.dailyQaAnswer.findMany({
      where: {
        answeredAt: { gte: month.start, lt: month.end },
        user: activeStudentWhere,
      },
      distinct: ["userId"],
      select: { userId: true },
    }),
    prisma.practiceSession.findMany({
      where: {
        status: "completed",
        completedAt: { gte: month.start, lt: month.end },
        user: activeStudentWhere,
      },
      distinct: ["userId"],
      select: { userId: true },
    }),
    prisma.dailyQaAnswer.count({
      where: {
        answeredAt: { gte: week.start, lt: week.end },
        user: activeStudentWhere,
      },
    }),
    prisma.practiceAnswer.count({
      where: {
        answeredAt: { gte: week.start, lt: week.end },
        session: { user: activeStudentWhere },
      },
    }),
    prisma.boardPost.count({
      where: {
        isPinned: true,
        deletedAt: null,
        author: { role: { name: "teacher" } },
      },
    }),
    listStudentLearningSummaries(1),
  ]);

  const activeStudentIds = new Set([
    ...monthlyDailyStudents.map(({ userId }) => userId),
    ...monthlyPracticeStudents.map(({ userId }) => userId),
  ]);

  return {
    registeredStudentCount,
    activeStudentCountThisMonth: activeStudentIds.size,
    answerCountThisWeek: weeklyDailyAnswerCount + weeklyPracticeAnswerCount,
    pinnedNoticeCount,
    recentStudents: recentStudentPage.items.slice(0, 4),
  };
}
