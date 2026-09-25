import Link from "next/link";
import type { StudentLearningSummary } from "@/lib/teacher/students";

const learningDateFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function StudentList({
  students,
  compact = false,
}: {
  students: StudentLearningSummary[];
  compact?: boolean;
}) {
  if (students.length === 0) {
    return (
      <p className="px-5 py-12 text-center text-sm font-bold text-slate-500">
        表示できる学生がいません。
      </p>
    );
  }

  return (
    <>
      <table className="hidden w-full table-fixed border-collapse md:table">
        <thead className="bg-slate-50 text-left text-[11px] font-black text-slate-500">
          <tr>
            <th className={`${compact ? "w-[34%]" : "w-[30%]"} px-5 py-3 sm:px-6`}>学生</th>
            <th className={`${compact ? "w-[32%]" : "w-[27%]"} px-5 py-3`}>最終学習</th>
            <th className={`${compact ? "w-[17%]" : "w-[15%]"} px-5 py-3 text-right`}>回答数</th>
            {compact ? null : <th className="w-[14%] px-5 py-3 text-right">正解数</th>}
            <th className={`${compact ? "w-[17%]" : "w-[14%]"} px-5 py-3 text-right`}>正答率</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {students.map((student) => (
            <tr key={student.id} className="text-xs font-bold text-slate-700">
              <td className="px-5 py-4 sm:px-6">
                <StudentName student={student} />
              </td>
              <td className="px-5 py-4 text-slate-500">
                {formatLearningDate(student.latestLearningAt)}
              </td>
              <td className="px-5 py-4 text-right">{student.answerCount.toLocaleString()}問</td>
              {compact ? null : (
                <td className="px-5 py-4 text-right">
                  {student.correctCount.toLocaleString()}問
                </td>
              )}
              <td className="px-5 py-4 text-right font-black text-emerald-700">
                {student.accuracy}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-slate-100 md:hidden">
        {students.map((student) => (
          <li key={student.id} className="p-5">
            <div className="flex items-start justify-between gap-4">
              <StudentName student={student} />
              <strong className="shrink-0 text-sm font-black text-emerald-700">
                {student.accuracy}%
              </strong>
            </div>
            <p className="mt-3 text-xs font-bold text-slate-500">
              最終学習 {formatLearningDate(student.latestLearningAt)}
            </p>
            <div className="mt-2 flex gap-4 text-xs font-black text-slate-700">
              <span>回答 {student.answerCount.toLocaleString()}問</span>
              {compact ? null : <span>正解 {student.correctCount.toLocaleString()}問</span>}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function StudentName({ student }: { student: StudentLearningSummary }) {
  return (
    <Link
      href={`/teacher/students/${student.id}`}
      className="inline-flex min-h-11 items-center gap-3 font-black text-slate-950 hover:text-blue-700"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-100 text-sm text-blue-700">
        {student.displayName.slice(0, 1)}
      </span>
      <span className="break-words">{student.displayName}</span>
    </Link>
  );
}

function formatLearningDate(value: string | null) {
  return value ? learningDateFormatter.format(new Date(value)) : "学習記録なし";
}
