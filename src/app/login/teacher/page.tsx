import { LoginLayout } from "@/components/login-layout";
import { TeacherLoginForm } from "@/components/teacher-login-form";

export default function TeacherLoginPage() {
  return (
    <LoginLayout audience="teacher">
      <TeacherLoginForm />
    </LoginLayout>
  );
}
