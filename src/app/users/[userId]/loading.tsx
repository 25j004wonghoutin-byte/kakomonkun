export default function Loading() {
  return <div role="status" aria-label="プロフィールを読み込み中" className="mx-auto w-full max-w-[960px]">
    <div className="mb-5 h-9 w-40 rounded bg-slate-200" />
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div className="h-16 bg-white" />
      <div className="h-32 bg-slate-100" />
      <div className="h-48 bg-white" />
    </div>
  </div>;
}
