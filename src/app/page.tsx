import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { StudentHome } from "./student-home";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();

  if (!user) redirect("/login");
  if (user.role.name === "teacher") redirect("/teacher");

  return <StudentHome />;
}
