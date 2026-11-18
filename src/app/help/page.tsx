import Link from "next/link";
import { redirect } from "next/navigation";
import { StudentShell } from "@/components/student-shell";
import { getCurrentUser } from "@/lib/auth";
import { getStudentIdentity } from "@/lib/me";
import { PRACTICE_COMPLETION_POINTS, PRACTICE_QUESTION_COUNTS } from "@/lib/practice-config";

export const metadata = { title: "ヘルプ・このアプリについて" };

const guides = [
  { name: "今日の一問一答", href: "/", description: "ホームで今日の問題に挑戦できます。回答後に正解と解説を確認できます。" },
  { name: "ランダム出題", href: "/random-quiz", description: "一問ずつ解きたいときに使います。回答と解説を確認してから次の問題に進めます。" },
  { name: "過去問練習", href: "/practice", description: "試験と問題数を選びます。「中断する」で途中までの回答を保存し、後から再開できます。" },
  { name: "復習ノート", href: "/review-notebook", description: "間違えた問題を解き直し、解説やAI解説を確認できます。" },
  { name: "模擬試験", href: "/mock-exam", description: "試験の受験期間と制限時間を確認して始めます。提出後に結果を確認でき、受験期間終了後は解答を見直せます。" },
  { name: "掲示板", href: "/board", description: "質問や学んだことを投稿できます。不適切な投稿は「通報」から教員へ匿名で知らせられます。" },
] as const;

export default async function HelpPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fhelp");
  if (user.role.name !== "student") redirect("/teacher");
  const practicePoints = PRACTICE_QUESTION_COUNTS.map((count) => `${count}問 ${PRACTICE_COMPLETION_POINTS[count]} pt`).join("、");

  return (
    <StudentShell identity={getStudentIdentity(user)}>
      <div className="mx-auto w-full max-w-[880px]">
        <h1 className="text-3xl font-black text-[#242823]">ヘルプ・このアプリについて</h1>
        <p className="mt-3 text-sm leading-7 text-slate-700">「目指せ合格！過去問くん」は、ITパスポートと基本情報技術者試験の過去問を使って学習するアプリです。</p>

        <section aria-labelledby="help-points" className="mt-6 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 id="help-points" className="text-xl font-black text-slate-950">ポイントの獲得方法</h2>
          <dl className="mt-2 divide-y divide-slate-200 text-sm">
            <div className="py-3">
              <dt className="font-bold">今日の一問一答</dt>
              <dd className="mt-1 leading-7 text-slate-700">1日1回、回答で1 pt。正解するとさらに1 pt（合計2 pt）。</dd>
            </div>
            <div className="py-3">
              <dt className="font-bold">過去問練習</dt>
              <dd className="mt-1 leading-7 text-slate-700">全問に回答して終了すると、{practicePoints}。100問はITパスポートのみです。完了ポイントは1日2回までで、全問回答時の正解ボーナス（10問正解ごとに1 pt）は3回目以降も獲得できます。</dd>
            </div>
            <div className="py-3">
              <dt className="font-bold">模擬試験</dt>
              <dd className="mt-1 leading-7 text-slate-700">各模擬試験の初回提出で20 pt。順位確定後、1位に150 pt、2位に100 pt、3位に75 ptが付与されます。</dd>
            </div>
          </dl>
          <p className="mt-2 text-sm leading-7 text-slate-700">
            所持ポイントと履歴は<Link href="/profile" className="font-bold text-blue-800 underline">マイページ</Link>で確認できます。ポイントは<Link href="/titles" className="font-bold text-blue-800 underline">称号ショップ</Link>で使えます。
          </p>
        </section>

        <section aria-labelledby="help-guides" className="mt-5 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 id="help-guides" className="text-xl font-black text-slate-950">主な機能の使い方</h2>
          <dl className="mt-2 divide-y divide-slate-200 text-sm">
            {guides.map(({ name, href, description }) => (
              <div className="py-3" key={href}>
                <dt><Link href={href} className="font-bold text-blue-800 underline">{name}</Link></dt>
                <dd className="mt-1 leading-7 text-slate-700">{description}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </StudentShell>
  );
}
