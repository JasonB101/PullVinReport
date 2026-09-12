import Link from "next/link";

import { Logo } from "@/components/logo";
import { StartReportLink } from "@/components/start-report-link";
import { BRAND, emailConfig, formatPrice } from "@/lib/config";

const COLUMNS = [
  {
    title: "Reports",
    links: [
      { href: "/#vin", label: "Check a VIN" },
      { href: "/sample", label: "See a sample report" },
      { href: "/is-carfax-worth-it", label: "Is Carfax worth it?" },
      { href: "/lookup", label: "Find my report" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/#how-it-works", label: "How it works" },
      { href: "/#pricing", label: "Pricing" },
      { href: "/#faq", label: "FAQ" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy policy" },
      { href: "/terms", label: "Terms of service" },
      { href: "/disclaimer", label: "Disclaimer" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="no-print border-t border-white/10 bg-ink-950 text-slate-400">
      <div className="container-page py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-4">
            <Logo variant="on-dark" />
            <p className="max-w-xs text-sm leading-relaxed">
              Vehicle history reports for buyers, sellers and owners — identify
              the VIN first, then one {formatPrice()} report, pulled live.
            </p>
            <a
              href={`mailto:${emailConfig.supportEmail}`}
              className="inline-block text-sm text-brand-300 hover:text-brand-200"
            >
              {emailConfig.supportEmail}
            </a>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                {column.title}
              </h3>
              <ul className="mt-4 space-y-3">
                {column.links.map((link) => (
                  <li key={link.href}>
                    {link.href === "/#vin" ? (
                      <StartReportLink className="text-sm transition hover:text-white">
                        {link.label}
                      </StartReportLink>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-sm transition hover:text-white"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 space-y-4 border-t border-white/10 pt-8 text-xs leading-relaxed">
          <p>
            {BRAND.name} is an independent service and is not affiliated with,
            endorsed by, or sponsored by any vehicle manufacturer, government
            agency, or any other vehicle history reporting company. All product
            and company names are the trademarks of their respective owners and
            are not used here to imply any association.
          </p>
          <p>
            Reports are compiled from third-party records and are provided for
            informational purposes only. They are not a guarantee of a
            vehicle&apos;s condition, title status, or fitness for purchase, and
            they are not a substitute for an independent inspection.{" "}
            {BRAND.name} is not a consumer reporting agency and its reports may
            not be used to make decisions about credit, insurance, employment,
            or tenancy.
          </p>
          <p className="text-slate-500">
            © {new Date().getFullYear()} {BRAND.name} · {BRAND.domain}
          </p>
        </div>
      </div>
    </footer>
  );
}
