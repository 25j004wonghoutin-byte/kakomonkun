import { notFound, redirect } from "next/navigation";
import { TeacherShell } from "@/components/teacher-shell";
import { requireTeacherPageUser } from "@/lib/teacher/auth";
import {
  getTeacherStudentDetail,
  isStudentId,
  parseTeacherStudentDetailQuery,
  type TeacherStudentDetailTab,
} from "@/lib/teacher/student-detail";
import { getBoardRestrictionExpiry } from "@/lib/board/restrictions";
import { BoardRestrictionForm } from "./board-restriction-form";
import { StudentLearningDetail } from "./student-learning-detail";

export const dynamic = "force-dynamic";

type TeacherStudentDetailPageProps = {
  params: Promise<{ userId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TeacherStudentDetailPage({
  params,
  searchParams,
}: TeacherStudentDetailPageProps) {
  const teacher = await requireTeacherPageUser();
  const [{ userId }, rawQuery] = await Promise.all([params, searchParams]);

  if (!isStudentId(userId)) notFound();

  const query = parseTeacherStudentDetailQuery(rawQuery);
  const [data, restrictionExpiry] = await Promise.all([
    getTeacherStudentDetail(userId, query),
    getBoardRestrictionExpiry(userId, "student"),
  ]);
  if (!data) notFound();

  if (query.page > data.pagination.totalPages) {
    redirect(
      buildDetailHref(userId, query.tab, data.pagination.totalPages),
    );
  }

  return (
    <TeacherShell userId={teacher.id}>
      <StudentLearningDetail data={data} moderation={<BoardRestrictionForm key={userId} userId={userId} initialExpiry={restrictionExpiry} />} />
    </TeacherShell>
  );
}

function buildDetailHref(
  userId: string,
  tab: TeacherStudentDetailTab,
  page: number,
) {
  const params = new URLSearchParams();
  if (tab === "daily") params.set("tab", "daily");
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/teacher/students/${userId}${query ? `?${query}` : ""}`;
}
