import type { BoardActor } from "./contract";

export function toBoardActor(
  id: string,
  roleName: string,
): BoardActor | null {
  if (roleName !== "student" && roleName !== "teacher") {
    return null;
  }

  return { id, roleName };
}

export function canCreatePost(actor: BoardActor): boolean {
  return actor.roleName === "student" || actor.roleName === "teacher";
}

export function canPinPost(
  actor: BoardActor,
  authorRole: string,
): boolean {
  return actor.roleName === "teacher" && authorRole === "teacher";
}

export function canDeleteContent(
  actor: BoardActor,
  authorId: string,
): boolean {
  return actor.id === authorId || actor.roleName === "teacher";
}
