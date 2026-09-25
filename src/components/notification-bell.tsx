import Link from "next/link";

type NotificationBellProps = {
  href?: string;
};

export function NotificationBell({ href = "/notifications" }: NotificationBellProps) {
  return (
    <Link
      href={href}
      aria-label="通知"
      className="relative grid size-10 place-items-center rounded-full text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
        <path
          d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 8.5C3 17.33 3.67 18 4.5 18h15c.83 0 1.5-.67 1.5-1.5C21 15 18 15 18 8ZM9.75 21h4.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}
