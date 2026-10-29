import { PrismaClient } from "../../prisma/generated/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createDatabasePool } from "./database-connection";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

function createPrismaClient(databaseUrl: string) {
  const pool = createDatabasePool(databaseUrl);
  const adapter = new PrismaPg(pool, { disposeExternalPool: true });
  return new PrismaClient({
    adapter,
    // Allow short bursts to wait for a connection instead of Prisma's 2s default.
    transactionOptions: { maxWait: 10_000 },
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ?? createPrismaClient(connectionString);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
