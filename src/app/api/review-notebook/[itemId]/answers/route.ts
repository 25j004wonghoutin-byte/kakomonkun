import { reviewNotebookHandlers } from "@/lib/review-notebook/server";
export async function POST(request: Request, context: { params: Promise<{ itemId: string }> }) {
  return reviewNotebookHandlers.answer(request, await context.params);
}
