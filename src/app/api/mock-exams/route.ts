import { createProductionMockHandlers } from "@/lib/mock-exams/handlers";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const GET=createProductionMockHandlers().list;
