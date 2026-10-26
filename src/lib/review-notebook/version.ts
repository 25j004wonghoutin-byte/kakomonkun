import { createHash } from "node:crypto";
export function questionVersionOf(value: { id: string; updatedAt: Date; choices: Array<{ id: string; updatedAt: Date }> }): string {
  const canonical = {
    id: value.id,
    updatedAt: value.updatedAt.toISOString(),
    choices: [...value.choices].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(choice => ({ id: choice.id, updatedAt: choice.updatedAt.toISOString() })),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
