import { createProductionMockHandlers } from "@/lib/mock-exams/handlers";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const handlers=createProductionMockHandlers();
export async function GET(request:Request,context:{params:Promise<{attemptId:string}>}){
  return handlers.result(request,await context.params);
}
