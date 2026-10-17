import { createProductionMockHandlers } from "@/lib/mock-exams/handlers";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const handlers=createProductionMockHandlers();
export async function POST(request:Request,context:{params:Promise<{attemptId:string}>}){
  return handlers.answer(request,await context.params);
}
