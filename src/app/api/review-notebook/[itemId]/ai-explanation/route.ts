import { reviewAiHandler } from "@/lib/review-notebook/ai-server";
export async function POST(request: Request, context: { params: Promise<{ itemId: string }> }) {
  return reviewAiHandler(request, await context.params);
}
