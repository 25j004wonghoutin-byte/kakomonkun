import { createMockJobHandler } from "@/lib/mock-exams/job-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const POST = createMockJobHandler({ database: async () => (await import("@/lib/prisma")).prisma });
