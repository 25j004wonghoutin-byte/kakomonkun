import type { MockAttempt, Prisma } from "../../../prisma/generated/client";
import { MockError, type MockActor } from "./contract";

export async function dbNow(tx: Prisma.TransactionClient): Promise<Date> {
  return (await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`)[0].now;
}

export function assertMockStudent(actor: MockActor): void {
  if (actor.roleName !== "student" || actor.status !== "active" || actor.deletedAt !== null) {
    throw new MockError("student_required",403,"有効な学生アカウントで利用してください。");
  }
}

/** 全変更処理の共通順序: 試験 → user(NO KEY UPDATE) → profile → attempt。 */
export async function lockMockAttempt(tx: Prisma.TransactionClient, actor: MockActor, attemptId: string): Promise<MockAttempt> {
  assertMockStudent(actor);
  if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(attemptId))throw new MockError("invalid_attempt",400,"受験IDが正しくありません。");
  const before=await tx.mockAttempt.findUnique({where:{id:attemptId},select:{mockExamId:true,userId:true}});
  if(!before||before.userId!==actor.id)throw new MockError("attempt_not_found",404,"受験結果が見つかりません。");
  await tx.$queryRaw`SELECT id FROM public.mock_exams WHERE id=${before.mockExamId}::uuid FOR NO KEY UPDATE`;
  await tx.$queryRaw`SELECT id FROM public.users WHERE id=${actor.id}::uuid FOR NO KEY UPDATE`;
  await tx.$queryRaw`SELECT user_id FROM public.student_profiles WHERE user_id=${actor.id}::uuid FOR UPDATE`;
  const user=await tx.user.findUnique({where:{id:actor.id},select:{status:true,deletedAt:true,role:{select:{name:true}}}});
  if(!user||user.status!=="active"||user.deletedAt!==null||user.role.name!=="student")throw new MockError("student_required",403,"有効な学生アカウントで利用してください。");
  await tx.$queryRaw`SELECT id FROM public.mock_attempts WHERE id=${attemptId}::uuid FOR UPDATE`;
  const attempt=await tx.mockAttempt.findUnique({where:{id:attemptId}});
  if(!attempt||attempt.userId!==actor.id||attempt.mockExamId!==before.mockExamId)throw new MockError("attempt_not_found",404,"受験結果が見つかりません。");
  return attempt;
}
