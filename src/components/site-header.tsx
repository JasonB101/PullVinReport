import Link from "next/link";

import { Logo } from "@/components/logo";
import { StartReportLink } from "@/components/start-report-link";
import { formatPrice } from "@/lib/config";

const NAV = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/sample", label: "Sample report" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
];

export type HeaderCta = "buy" | "another" | "none";

type Props = {
  /** `on-dark` for pages that open with the dark hero. */
  variant?: "on-dark" | "on-light";
  /**
   * What the header offers.
   *
   * `buy` is the priced CTA. `another` is for someone who already paid —
   * pitching $14.99 on the report they just bought reads as if they haven't.
   * `none` hides it (print chrome, tight admin-adjacent pages).
   */
  cta?: HeaderCta;
};

export function SiteHeader({ variant = "on-light", cta = "buy" }: Props) {
  const onDark = variant === "on-dark";
  // The dark header sits above the hero rather than over it, so a translucent
  // fill would read as grey against the white body behind it.
  return (
    <header
      className={`no-print sticky top-0 z-40 border-b ${
        onDark
          ? "border-white/10 bg-ink-950"
          : "border-slate-200 bg-white/85 backdrop-blur-xl"
      }`}
    >
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Logo variant={variant} />

        <nav className="hidden items-center gap-7 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`text-sm font-medium transition ${
                onDark
                  ? "text-slate-300 hover:text-white"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <HeaderCta variant={variant} mode={cta} />
      </div>
    </header>
  );
}

function HeaderCta({
  variant,
  mode,
}: {
  variant: "on-dark" | "on-light";
  mode: HeaderCta;
}) {
  if (mode === "none") return <span className="w-0" aria-hidden="true" />;

  if (mode === "another") {
    return (
      <StartReportLink
        className={`inline-flex items-center rounded-full px-4 py-2.5 text-sm font-semibold transition ${
          variant === "on-dark"
            ? "text-slate-200 ring-1 ring-inset ring-white/20 hover:bg-white/10"
            : "text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
        }`}
      >
        Buy another report
      </StartReportLink>
    );
  }

  return (
    <StartReportLink className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_-12px_rgba(37,99,235,0.9)] transition hover:bg-brand-500 active:scale-[0.98]">
      Get a report
      <span className="hidden text-brand-100 sm:inline">{formatPrice()}</span>
    </StartReportLink>
  );
}
