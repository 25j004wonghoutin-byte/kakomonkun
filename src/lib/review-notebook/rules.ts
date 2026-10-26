import type { ReviewActor, ReviewStatus } from "./contract";
import { ReviewNotebookError } from "./contract";
export function nextReviewStatus(isCorrect: boolean): ReviewStatus { return isCorrect ? "reviewed" : "reviewing"; }
export function assertReviewStudent(actor: ReviewActor | null): asserts actor is ReviewActor {
  if (!actor || actor.status !== "active" || actor.deletedAt !== null) throw new ReviewNotebookError("unauthorized", 401, "ログインしてください。");
  if (actor.roleName !== "student") throw new ReviewNotebookError("student_only", 403, "学生のみ利用できます。");
}
