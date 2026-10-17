import { createProductionMockHandlers } from "@/lib/mock-exams/handlers";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const handlers=createProductionMockHandlers();
export async function POST(request:Request,context:{params:Promise<{mockExamId:string}>}){
  return handlers.start(request,await context.params);
}
