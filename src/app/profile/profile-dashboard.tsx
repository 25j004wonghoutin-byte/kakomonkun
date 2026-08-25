"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { StudentShell } from "@/components/student-shell";
import type {
  ProfileCategoryStat,
  ProfilePageData,
  ProfileRecentActivity,
  ProfileTitleData,
} from "@/lib/profile-data";
import { readJsonResponse } from "@/lib/read-json-response";

const activityDateFormatter = new Intl.DateTimeFormat("ja-JP", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

type Period = "overall" | "month";

type UpdateProfileResponse = {
  displayName?: string;
  bio?: string | null;
  error?: string;
};

type EquipTitleResponse = {
  currentTitle?: ProfileTitleData;
  equippedAt?: string;
  error?: string;
};

export function ProfileDashboard({ initialData }: { initialData: ProfilePageData }) {
  const [profile, setProfile] = useState(initialData.profile);
  const [ownedTitles, setOwnedTitles] = useState(initialData.ownedTitles);
  const [period, setPeriod] = useState<Period>("overall");
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState(profile.displayName);
  const [editBio, setEditBio] = useState(profile.bio ?? "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [selectedTitleId, setSelectedTitleId] = useState(
    profile.currentTitle?.id ?? ownedTitles[0]?.id ?? "",
  );
  const [titleSaving, setTitleSaving] = useState(false);
  const [titleError, setTitleError] = useState("");
  const profileDialogRef = useRef<HTMLDialogElement>(null);
  const titleDialogRef = useRef<HTMLDialogElement>(null);

  const accuracy =
    period === "overall" ? initialData.stats.overallAccuracy : initialData.stats.monthAccuracy;
  const visibleActivities = showAllActivities
    ? initialData.recentActivities
    : initialData.recentActivities.slice(0, 3);
  const insight = getLearningInsight(initialData.categoryStats, period);
  const accuracyTrend = formatAccuracyTrend(initialData.stats);

  function openProfileDialog() {
    setEditDisplayName(profile.displayName);
    setEditBio(profile.bio ?? "");
    setProfileError("");
    profileDialogRef.current?.showModal();
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileSaving(true);
    setProfileError("");

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: editDisplayName, bio: editBio }),
      });
      const data = await readJsonResponse<UpdateProfileResponse>(response);
      if (!response.ok || !data?.displayName) {
        throw new Error(data?.error ?? "プロフィールを更新できませんでした。");
      }

      setProfile((current) => ({
        ...current,
        displayName: data.displayName!,
        bio: data.bio ?? null,
      }));
      profileDialogRef.current?.close();
    } catch (cause) {
      setProfileError(
        cause instanceof Error ? cause.message : "プロフィールを更新できませんでした。",
      );
    } finally {
      setProfileSaving(false);
    }
  }

  function openTitleDialog() {
    setSelectedTitleId(profile.currentTitle?.id ?? ownedTitles[0]?.id ?? "");
    setTitleError("");
    titleDialogRef.current?.showModal();
  }

  async function equipTitle() {
    if (!selectedTitleId) return;
    if (selectedTitleId === profile.currentTitle?.id) {
      titleDialogRef.current?.close();
      return;
    }

    setTitleSaving(true);
    setTitleError("");

    try {
      const response = await fetch("/api/profile/equip-title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titleId: selectedTitleId }),
      });
      const data = await readJsonResponse<EquipTitleResponse>(response);
      if (!response.ok || !data?.currentTitle || !data.equippedAt) {
        throw new Error(data?.error ?? "称号を変更できませんでした。");
      }

      setProfile((current) => ({ ...current, currentTitle: data.currentTitle! }));
      setOwnedTitles((current) =>
        current.map((ownedTitle) =>
          ownedTitle.id === data.currentTitle!.id
            ? { ...ownedTitle, equippedAt: data.equippedAt! }
            : ownedTitle,
        ),
      );
      titleDialogRef.current?.close();
    } catch (cause) {
      setTitleError(cause instanceof Error ? cause.message : "称号を変更できませんでした。");
    } finally {
      setTitleSaving(false);
    }
  }

  return (
    <StudentShell userName={profile.displayName} points={profile.totalPoints}>
      <div className="mx-auto w-full max-w-[1080px] min-w-0">
        <div className="mb-5">
          <p className="mb-1 text-xs font-black text-blue-600">MY PAGE</p>
          <h1 className="text-3xl font-black text-slate-950">マイページ</h1>
        </div>

        <section
          aria-labelledby="profile-name"
          className="grid min-w-0 gap-5 rounded-lg border border-l-4 border-slate-200 border-l-blue-600 bg-white p-5 shadow-[0_14px_40px_-30px_rgba(15,23,42,0.55)] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:p-6"
        >
          <ProfileAvatar displayName={profile.displayName} avatarUrl={profile.avatarUrl} />
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2.5">
              <h2 id="profile-name" className="min-w-0 break-all text-xl font-black text-slate-950">
                {profile.displayName}
              </h2>
              {profile.currentTitle ? (
                <span className="inline-flex min-h-7 items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 text-xs font-black text-amber-800">
                  {profile.currentTitle.name}
                </span>
              ) : null}
            </div>
            <p className="mt-2 max-w-2xl break-words text-sm font-semibold leading-7 text-slate-600">
              {profile.bio || "自己紹介はまだありません。"}
            </p>
          </div>
          <button
            type="button"
            onClick={openProfileDialog}
            className="min-h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-black text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 sm:justify-self-end"
          >
            プロフィール編集
          </button>
        </section>

        <section aria-label="学習状況の概要" className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard
            symbol="P"
            tone="amber"
            label="所持ポイント"
            value={`${profile.totalPoints.toLocaleString()} pt`}
            note={`今月 ${formatSignedNumber(initialData.stats.monthPoints)} pt`}
          />
          <MetricCard
            symbol="回"
            tone="blue"
            label="練習完了"
            value={`${initialData.stats.totalPracticeCount.toLocaleString()} 回`}
            note={`今月 ${initialData.stats.monthPracticeCount.toLocaleString()} 回`}
          />
          <MetricCard
            symbol="問"
            tone="green"
            label="総回答数"
            value={`${initialData.stats.totalAnswerCount.toLocaleString()} 問`}
            note={`正解 ${initialData.stats.totalCorrectCount.toLocaleString()} 問`}
          />
          <MetricCard
            symbol="%"
            tone="rose"
            label="総合正答率"
            value={`${initialData.stats.overallAccuracy}%`}
            note={accuracyTrend}
          />
        </section>

        <div className="mt-4 grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
          <div className="min-w-0 space-y-4">
            <section aria-labelledby="learning-status-heading" className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_14px_40px_-30px_rgba(15,23,42,0.55)]">
              <div className="flex min-h-[66px] flex-col items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center">
                <h2 id="learning-status-heading" className="text-base font-black text-slate-950">
                  学習状況
                </h2>
                <div
                  role="group"
                  aria-label="集計期間"
                  className="grid w-full grid-cols-2 rounded-md border border-slate-300 bg-slate-50 p-1 sm:w-auto"
                >
                  {(["overall", "month"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={period === option}
                      onClick={() => setPeriod(option)}
                      className={`min-h-9 min-w-16 rounded px-3 text-xs font-black transition ${
                        period === option
                          ? "bg-white text-blue-700 shadow-sm"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {option === "overall" ? "総合" : "今月"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-5">
                <div className="grid items-center gap-5 text-center sm:grid-cols-[116px_minmax(0,1fr)] sm:text-left">
                  <AccuracyRing accuracy={accuracy} period={period} />
                  <div>
                    <h3 className="text-sm font-black text-slate-950">{insight.heading}</h3>
                    <p className="mt-1 text-xs font-semibold leading-6 text-slate-600">
                      {insight.detail}
                    </p>
                  </div>
                </div>

                <div className="mt-5 space-y-3 border-t border-slate-200 pt-5">
                  {initialData.categoryStats.map((category) => {
                    const value =
                      period === "overall" ? category.overallAccuracy : category.monthAccuracy;
                    const answerCount =
                      period === "overall"
                        ? category.overallAnswerCount
                        : category.monthAnswerCount;
                    return (
                      <div
                        key={category.code}
                        className="grid grid-cols-[92px_minmax(0,1fr)_42px] items-center gap-2.5 sm:grid-cols-[108px_minmax(0,1fr)_46px] sm:gap-3"
                      >
                        <span className="truncate text-xs font-black text-slate-700" title={category.name}>
                          {category.name.replace(/系$/, "")}
                        </span>
                        <div
                          role="img"
                          aria-label={`${category.name} ${answerCount}問中、正答率${value}%`}
                          className="h-2 overflow-hidden rounded-full bg-slate-200"
                        >
                          <span
                            className="block h-full rounded-full bg-blue-600 transition-[width] duration-200"
                            style={{ width: `${value}%` }}
                          />
                        </div>
                        <strong className="text-right text-xs text-slate-800">{value}%</strong>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <section aria-labelledby="recent-learning-heading" className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_14px_40px_-30px_rgba(15,23,42,0.55)]">
              <div className="flex min-h-[66px] items-center justify-between gap-4 border-b border-slate-200 px-5 py-3">
                <h2 id="recent-learning-heading" className="text-base font-black text-slate-950">
                  最近の学習
                </h2>
                {initialData.recentActivities.length > 3 ? (
                  <button
                    type="button"
                    aria-expanded={showAllActivities}
                    onClick={() => setShowAllActivities((current) => !current)}
                    className="min-h-11 rounded-md border border-blue-200 bg-blue-50 px-4 text-xs font-black text-blue-700 transition hover:bg-blue-100"
                  >
                    {showAllActivities ? "閉じる" : "すべて見る"}
                  </button>
                ) : null}
              </div>
              {visibleActivities.length > 0 ? (
                <ul className="divide-y divide-slate-100">
                  {visibleActivities.map((activity) => (
                    <RecentActivityRow key={activity.id} activity={activity} />
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-10 text-center text-sm font-bold text-slate-500">
                  学習記録はまだありません。
                </p>
              )}
            </section>
          </div>

          <aside>
            <section aria-labelledby="titles-heading" className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_14px_40px_-30px_rgba(15,23,42,0.55)]">
              <div className="flex min-h-[66px] items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <h2 id="titles-heading" className="text-base font-black text-slate-950">
                  称号
                </h2>
                <span className="text-xs font-bold text-slate-500">
                  {ownedTitles.length.toLocaleString()} 個所持
                </span>
              </div>

              {profile.currentTitle ? (
                <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-5 py-5">
                  <TitleSymbol rarity={profile.currentTitle.rarity} large />
                  <div className="min-w-0">
                    <span className="block text-[10px] font-black text-amber-800">現在の称号</span>
                    <strong className="mt-1 block break-words text-base font-black text-amber-950">
                      {profile.currentTitle.name}
                    </strong>
                  </div>
                </div>
              ) : (
                <div className="border-b border-slate-200 bg-slate-50 px-5 py-6 text-center">
                  <span className="mx-auto grid size-12 place-items-center rounded-full border border-slate-300 bg-white text-sm font-black text-slate-500">
                    称
                  </span>
                  <strong className="mt-3 block text-sm font-black text-slate-800">称号未装備</strong>
                  <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                    所持している称号を装備すると、ここに表示されます。
                  </p>
                </div>
              )}

              {ownedTitles.length > 0 ? (
                <div className="divide-y divide-slate-100 px-5">
                  {ownedTitles.slice(0, 3).map((ownedTitle) => (
                    <div
                      key={ownedTitle.id}
                      className="grid min-h-[62px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-2"
                    >
                      <TitleSymbol rarity={ownedTitle.rarity} />
                      <div className="min-w-0">
                        <strong className="block break-words text-xs font-black text-slate-900">
                          {ownedTitle.name}
                        </strong>
                        <span className="mt-0.5 block text-[9px] font-bold uppercase text-slate-500">
                          {ownedTitle.rarity}
                        </span>
                      </div>
                      {ownedTitle.id === profile.currentTitle?.id ? (
                        <span className="text-[10px] font-black text-emerald-700">装備中</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-5 py-5 text-center text-xs font-semibold leading-5 text-slate-500">
                  まだ称号を持っていません。
                </p>
              )}

              <div className="grid gap-2 border-t border-slate-200 p-4">
                <button
                  type="button"
                  onClick={openTitleDialog}
                  disabled={ownedTitles.length === 0}
                  className="min-h-11 rounded-md bg-blue-600 px-4 text-sm font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  称号を変更
                </button>
                <Link
                  href="/titles"
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-black text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                >
                  称号ショップへ
                </Link>
              </div>
            </section>
          </aside>
        </div>
      </div>

      <dialog
        ref={profileDialogRef}
        aria-labelledby="profile-edit-title"
        onClose={() => setProfileError("")}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-lg border-0 p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50"
      >
        <form onSubmit={saveProfile}>
          <div className="flex min-h-[66px] items-center justify-between gap-4 border-b border-slate-200 px-5 py-3">
            <h2 id="profile-edit-title" className="text-lg font-black">
              プロフィール編集
            </h2>
            <button
              type="button"
              aria-label="閉じる"
              onClick={() => profileDialogRef.current?.close()}
              className="grid size-11 place-items-center rounded-full text-xl font-bold text-slate-600 transition hover:bg-slate-100"
            >
              ×
            </button>
          </div>
          <div className="p-5">
            <label htmlFor="display-name" className="block text-sm font-black text-slate-800">
              表示名
            </label>
            <input
              id="display-name"
              value={editDisplayName}
              maxLength={100}
              required
              onChange={(event) => setEditDisplayName(event.target.value)}
              className="mt-2 min-h-11 w-full rounded-md border border-slate-300 px-3 text-base outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />

            <div className="mt-5 flex items-end justify-between gap-4">
              <label htmlFor="profile-bio" className="block text-sm font-black text-slate-800">
                自己紹介
              </label>
              <span className="text-xs font-bold text-slate-500">{editBio.length} / 200</span>
            </div>
            <textarea
              id="profile-bio"
              value={editBio}
              maxLength={200}
              rows={4}
              onChange={(event) => setEditBio(event.target.value)}
              className="mt-2 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-base leading-7 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />

            {profileError ? (
              <p role="alert" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
                {profileError}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => profileDialogRef.current?.close()}
              className="min-h-11 rounded-md border border-slate-300 px-5 text-sm font-black text-slate-700 transition hover:bg-slate-100"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={profileSaving}
              className="min-h-11 rounded-md bg-blue-600 px-5 text-sm font-black text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:bg-slate-400"
            >
              {profileSaving ? "保存中..." : "保存する"}
            </button>
          </div>
        </form>
      </dialog>

      <dialog
        ref={titleDialogRef}
        aria-labelledby="title-equip-heading"
        onClose={() => setTitleError("")}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-lg border-0 p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50"
      >
        <div className="flex min-h-[66px] items-center justify-between gap-4 border-b border-slate-200 px-5 py-3">
          <h2 id="title-equip-heading" className="text-lg font-black">
            装備する称号
          </h2>
          <button
            type="button"
            aria-label="閉じる"
            onClick={() => titleDialogRef.current?.close()}
            className="grid size-11 place-items-center rounded-full text-xl font-bold text-slate-600 transition hover:bg-slate-100"
          >
            ×
          </button>
        </div>
        <div className="max-h-[55vh] space-y-2 overflow-y-auto p-5">
          {ownedTitles.map((ownedTitle) => {
            const selected = selectedTitleId === ownedTitle.id;
            return (
              <button
                key={ownedTitle.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setSelectedTitleId(ownedTitle.id)}
                className={`grid min-h-[68px] w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${
                  selected
                    ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100"
                    : "border-slate-200 bg-white hover:border-blue-300"
                }`}
              >
                <TitleSymbol rarity={ownedTitle.rarity} />
                <span className="min-w-0">
                  <strong className="block break-words text-sm font-black text-slate-900">
                    {ownedTitle.name}
                  </strong>
                  <span className="mt-0.5 block text-[10px] font-bold uppercase text-slate-500">
                    {ownedTitle.rarity}
                  </span>
                </span>
                <span className="text-xs font-black text-blue-700">{selected ? "選択中" : ""}</span>
              </button>
            );
          })}
          {titleError ? (
            <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
              {titleError}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => titleDialogRef.current?.close()}
            className="min-h-11 rounded-md border border-slate-300 px-5 text-sm font-black text-slate-700 transition hover:bg-slate-100"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={equipTitle}
            disabled={!selectedTitleId || titleSaving}
            className="min-h-11 rounded-md bg-blue-600 px-5 text-sm font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {titleSaving ? "変更中..." : "この称号を装備"}
          </button>
        </div>
      </dialog>
    </StudentShell>
  );
}

function ProfileAvatar({ displayName, avatarUrl }: { displayName: string; avatarUrl: string | null }) {
  return (
    <span
      role="img"
      aria-label={`${displayName}のプロフィール画像`}
      className="grid size-[72px] shrink-0 place-items-center rounded-full border-4 border-blue-100 bg-blue-50 bg-cover bg-center text-2xl font-black text-blue-800"
      style={avatarUrl ? { backgroundImage: `url(${JSON.stringify(avatarUrl)})` } : undefined}
    >
      {avatarUrl ? null : displayName.trim().charAt(0).toUpperCase() || "学"}
    </span>
  );
}

function MetricCard({
  symbol,
  tone,
  label,
  value,
  note,
}: {
  symbol: string;
  tone: "amber" | "blue" | "green" | "rose";
  label: string;
  value: string;
  note: string;
}) {
  const toneClass = {
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    rose: "bg-rose-50 text-rose-700",
  }[tone];

  return (
    <article className="grid min-h-[116px] min-w-0 content-start gap-2 rounded-lg border border-slate-200 bg-white p-4 sm:min-h-[92px] sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:content-center sm:gap-3">
      <span className={`grid size-10 place-items-center rounded-lg text-xs font-black ${toneClass}`}>
        {symbol}
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-bold text-slate-500">{label}</span>
        <strong className="mt-0.5 block break-words text-xl font-black leading-tight text-slate-950">
          {value}
        </strong>
        <span className="mt-1 block text-[10px] font-bold text-slate-500">{note}</span>
      </span>
    </article>
  );
}

function AccuracyRing({ accuracy, period }: { accuracy: number; period: Period }) {
  return (
    <div
      role="img"
      aria-label={`${period === "overall" ? "総合" : "今月"}の正答率 ${accuracy}%`}
      className="relative mx-auto grid size-[108px] place-items-center rounded-full"
      style={{
        background: `conic-gradient(#2563eb 0 ${accuracy}%, #e2e8f0 ${accuracy}% 100%)`,
      }}
    >
      <span className="absolute inset-[10px] rounded-full bg-white" />
      <span className="relative z-[1] text-center">
        <strong className="block text-2xl font-black leading-none text-slate-950">{accuracy}%</strong>
        <span className="mt-1 block text-[10px] font-bold text-slate-500">正答率</span>
      </span>
    </div>
  );
}

function RecentActivityRow({ activity }: { activity: ProfileRecentActivity }) {
  const incorrect = activity.result === "不正解";
  return (
    <li className="grid min-h-[72px] grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-5 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
      <span
        aria-hidden="true"
        className={`grid size-9 place-items-center rounded-lg text-xs font-black ${
          activity.kind === "practice"
            ? "bg-blue-50 text-blue-700"
            : "bg-emerald-50 text-emerald-700"
        }`}
      >
        {activity.kind === "practice" ? "練" : "日"}
      </span>
      <span className="min-w-0">
        <strong className="block break-words text-xs font-black text-slate-900 sm:text-sm">
          {activity.title}
        </strong>
        <span className="mt-1 block text-[10px] font-bold text-slate-500">
          {activityDateFormatter.format(new Date(activity.occurredAt))} ・ {activity.detail}
        </span>
      </span>
      <span className="col-start-2 text-left sm:col-start-auto sm:text-right">
        <strong className={`text-sm font-black ${incorrect ? "text-rose-700" : "text-slate-900"}`}>
          {activity.result}
        </strong>
        <span
          className={`ml-2 text-[10px] font-black sm:ml-0 sm:mt-1 sm:block ${
            activity.earnedPoints > 0 ? "text-emerald-700" : "text-slate-500"
          }`}
        >
          {activity.earnedPoints > 0 ? `+${activity.earnedPoints} pt` : "0 pt"}
        </span>
      </span>
    </li>
  );
}

function TitleSymbol({ rarity, large = false }: { rarity: string; large?: boolean }) {
  const colorClass =
    rarity === "epic"
      ? "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700"
      : rarity === "rare"
        ? "border-cyan-200 bg-cyan-50 text-cyan-700"
        : "border-blue-200 bg-blue-50 text-blue-700";

  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full border font-black ${colorClass} ${
        large ? "size-12 text-sm" : "size-9 text-xs"
      }`}
    >
      称
    </span>
  );
}

function formatSignedNumber(value: number) {
  return value > 0 ? `+${value.toLocaleString()}` : value.toLocaleString();
}

function formatAccuracyTrend(stats: ProfilePageData["stats"]) {
  if (stats.monthAnswerCount === 0) return "今月は記録なし";
  if (stats.previousMonthAccuracy === null) return `今月 ${stats.monthAccuracy}%`;

  const difference = stats.monthAccuracy - stats.previousMonthAccuracy;
  return `前月比 ${difference > 0 ? "+" : ""}${difference}%`;
}

function getLearningInsight(categoryStats: ProfileCategoryStat[], period: Period) {
  const activeCategories = categoryStats.filter((category) =>
    period === "overall" ? category.overallAnswerCount > 0 : category.monthAnswerCount > 0,
  );

  if (activeCategories.length === 0) {
    return {
      heading: "最初の練習を始めましょう",
      detail: "過去問練習を完了すると、分野別の正答率がここに表示されます。",
    };
  }

  const accuracyFor = (category: ProfileCategoryStat) =>
    period === "overall" ? category.overallAccuracy : category.monthAccuracy;
  const strongest = activeCategories.reduce((best, category) =>
    accuracyFor(category) > accuracyFor(best) ? category : best,
  );
  const weakest = activeCategories.reduce((lowest, category) =>
    accuracyFor(category) < accuracyFor(lowest) ? category : lowest,
  );

  return {
    heading: `${strongest.name}が得意分野です`,
    detail:
      strongest.code === weakest.code
        ? "練習を重ねると、分野ごとの得意・苦手を比較できます。"
        : `${weakest.name}を重点的に復習すると、全体の底上げにつながります。`,
  };
}
