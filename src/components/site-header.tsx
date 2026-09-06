import Link from "next/link";

import { Logo } from "@/components/logo";
import { formatPrice } from "@/lib/config";

const NAV = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/sample", label: "Sample report" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
];

type Props = {
  /** `on-dark` for pages that open with the dark hero. */
  variant?: "on-dark" | "on-light";
};

export function SiteHeader({ variant = "on-light" }: Props) {
  const onDark = variant === "on-dark";
  return (
    <header
      className={`no-print sticky top-0 z-40 border-b backdrop-blur-xl ${
        onDark ? "border-white/10 bg-ink-950/70" : "border-slate-200 bg-white/85"
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

        <Link
          href="/#vin"
          className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_-12px_rgba(37,99,235,0.9)] transition hover:bg-brand-500 active:scale-[0.98]"
        >
          Get a report
          <span className="hidden text-brand-100 sm:inline">{formatPrice()}</span>
        </Link>
      </div>
    </header>
  );
}
