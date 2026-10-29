"use client";

import { useLinkStatus } from "next/link";

export function NavigationPendingIndicator({ label }: { label: string }) {
  const { pending } = useLinkStatus();

  return (
    <span
      data-navigation-pending={pending}
      className="ml-auto flex size-3 shrink-0 items-center justify-center"
    >
      <span
        aria-hidden="true"
        className={pending ? "size-3 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin" : "invisible size-3"}
      />
      {pending ? <span role="status" className="sr-only">{label}へ移動中</span> : null}
    </span>
  );
}
