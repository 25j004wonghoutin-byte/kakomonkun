import { reviewNotebookHandlers } from "@/lib/review-notebook/server";
export async function GET(request: Request, context: { params: Promise<{ itemId: string }> }) {
  return reviewNotebookHandlers.item(request, await context.params);
}
