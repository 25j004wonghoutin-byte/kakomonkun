import { StudentShell } from "@/components/student-shell";

export function StudentPageLoading({ title }: { title: string }) {
  return (
    <StudentShell isLoading>
      <section
        role="status"
        aria-label={title + "を読み込み中"}
        aria-busy="true"
        data-page-loading="true"
        className="mx-auto w-full max-w-[1120px]"
      >
        <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
        <p className="mt-3 text-sm text-slate-500">読み込み中…</p>
        <div aria-hidden="true" className="mt-7 space-y-4">
          <div className="h-28 rounded-lg border border-slate-200 bg-white" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="h-48 rounded-lg border border-slate-200 bg-white" />
            <div className="h-48 rounded-lg border border-slate-200 bg-white" />
          </div>
        </div>
      </section>
    </StudentShell>
  );
}
