import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getStudentProfileData } from "@/lib/profile-data";
import { ProfileDashboard } from "./profile-dashboard";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role.name !== "student" || !user.studentProfile) redirect("/");

  const profileData = await getStudentProfileData(user.id);
  return <ProfileDashboard initialData={profileData} />;
}
