"use server";

import { revalidatePath } from "next/cache";
import { resolveBoardReport } from "@/lib/board/reports";
import { isUuid } from "@/lib/board/validation";
import { requireTeacherPageUser } from "@/lib/teacher/auth";

export async function markBoardReportResolved(formData: FormData) {
  await requireTeacherPageUser();
  const id = formData.get("reportId");
  if (!isUuid(id)) return;
  await resolveBoardReport(id);
  revalidatePath("/teacher/board-reports");
}
