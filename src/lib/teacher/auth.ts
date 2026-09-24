import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isTeacherRole } from "@/lib/teacher/identity";

export async function requireTeacherPageUser() {
  const user = await getCurrentUser();

  if (!user) redirect("/login/teacher");
  if (!isTeacherRole(user.role.name)) redirect("/");

  return user;
}

export async function getTeacherApiUser() {
  const user = await getCurrentUser();

  return user && isTeacherRole(user.role.name) ? user : null;
}
