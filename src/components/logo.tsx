import Link from "next/link";

type Props = {
  /** Which background the logo sits on, so the wordmark stays readable. */
  variant?: "on-dark" | "on-light";
  href?: string | null;
};

export function Logo({ variant = "on-light", href = "/" }: Props) {
  const content = (
    <span className="inline-flex items-center gap-2.5">
      <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-[0_6px_20px_-6px_rgba(37,99,235,0.8)]">
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-5 w-5 text-white"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 16.5V18a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1v-1.5" />
          <path d="M21.5 16.5V18a1 1 0 0 1-1 1H20a1 1 0 0 1-1-1v-1.5" />
          <path d="M3 16.5h18l-.9-5.1a2 2 0 0 0-1.2-1.5l-1.6-.6-1.3-2.6A2 2 0 0 0 14.2 5.6H9.8a2 2 0 0 0-1.8 1.1L6.7 9.3l-1.6.6a2 2 0 0 0-1.2 1.5Z" />
          <path d="M7 13.5h2M15 13.5h2" />
        </svg>
      </span>
      <span
        className={`text-[17px] font-semibold tracking-tight ${
          variant === "on-dark" ? "text-white" : "text-slate-900"
        }`}
      >
        Pull<span className="text-brand-500">Vin</span>Report
      </span>
    </span>
  );

  if (!href) return content;
  return (
    <Link href={href} className="inline-flex" aria-label="PullVinReport home">
      {content}
    </Link>
  );
}
