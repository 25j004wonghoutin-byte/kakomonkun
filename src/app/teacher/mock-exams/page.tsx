import { TeacherShell } from "@/components/teacher-shell";
import { ErrorCard } from "@/components/ui";
import { requireTeacherPageUser } from "@/lib/teacher/auth";
import { prisma } from "@/lib/prisma";
import { MockError, type ExamCode } from "@/lib/mock-exams/contract";
import { getTokyoDate } from "@/lib/tokyo-date";
import { getTeacherMockExams } from "@/lib/teacher/mock-exams";
import { MockExamStatus } from "./mock-exam-status";

export const dynamic = "force-dynamic";
export default async function TeacherMockExamsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireTeacherPageUser(), params = await searchParams;
  let data, error = "";
  try {
    data = await getTeacherMockExams(prisma, { id: user.id, roleName: user.role.name, status: user.status, deletedAt: user.deletedAt }, {
      examCode: (params.examCode ?? "it_passport") as ExamCode,
      month: (params.month ?? getTokyoDate(new Date()).slice(0, 7)) as string, cursor: (params.cursor ?? null) as string | null,
    });
  } catch (cause) { error = cause instanceof MockError ? cause.message : "模擬試験の状況を取得できませんでした。"; }
  return <TeacherShell>{data ? <MockExamStatus data={data} /> : <ErrorCard message={error} />}</TeacherShell>;
}
