import { TeacherShell } from "@/components/teacher-shell";
import { requireTeacherPageUser } from "@/lib/teacher/auth";

export const dynamic = "force-dynamic";

export default async function TeacherHomePage() {
  await requireTeacherPageUser();

  return (
    <TeacherShell>
      <div className="mx-auto max-w-[980px]">
        <p className="text-xs font-black tracking-[0.18em] text-blue-600">
          TEACHER DASHBOARD
        </p>
        <h1 className="mt-2 text-3xl font-black text-[#071d36]">教師ホーム</h1>
        <p className="mt-3 text-sm font-medium leading-6 text-slate-500">
          教師アカウントでログインしています。学習状況の集計画面は次の実装で追加します。
        </p>

        <section className="mt-8 rounded-xl border border-blue-100 bg-white p-6 shadow-[0_18px_46px_-30px_rgba(15,23,42,0.6)] sm:p-8">
          <h2 className="text-xl font-black text-[#071d36]">教師画面の準備ができました</h2>
          <p className="mt-3 text-sm font-medium leading-7 text-slate-600">
            教師専用メニューと学生画面との役割分離が有効になっています。掲示板は左側のメニューから確認できます。
          </p>
        </section>
      </div>
    </TeacherShell>
  );
}
