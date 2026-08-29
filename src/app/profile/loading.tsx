import { StudentShell } from "@/components/student-shell";

export default function ProfileLoading() {
  return (
    <StudentShell>
      <div className="mx-auto w-full max-w-[1120px] animate-pulse">
        <div className="h-3 w-20 rounded bg-blue-100" />
        <div className="mt-3 h-9 w-44 rounded bg-slate-200" />
        <div className="mt-7 h-32 rounded-lg border border-slate-200 bg-white" />
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-24 rounded-lg border border-slate-200 bg-white" />
          ))}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
          <div className="h-[420px] rounded-lg border border-slate-200 bg-white" />
          <div className="h-[360px] rounded-lg border border-slate-200 bg-white" />
        </div>
      </div>
    </StudentShell>
  );
}
