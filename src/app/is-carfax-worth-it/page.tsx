import type { Metadata } from "next";
import Link from "next/link";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { StartReportLink } from "@/components/start-report-link";
import { BRAND, formatPrice } from "@/lib/config";

const TITLE = "Is Carfax Worth It in 2026? Honest Comparison | Vehicle History by VIN";
const DESCRIPTION =
  "Carfax isn’t the only vehicle history report. See when it’s worth $45, when an NMVTIS one-shot is enough, and what’s free before you buy.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: [
    "Carfax alternative",
    "cheap VIN check",
    "vehicle history report comparison",
    "Is Carfax worth it",
    "NMVTIS VIN history",
  ],
  alternates: { canonical: "/is-carfax-worth-it" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/is-carfax-worth-it",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

const TLDR = [
  {
    title: "Get a report before you buy",
    body: "Yes — especially if the price looks too good.",
  },
  {
    title: "When Carfax is worth it",
    body: "Deep dealer service records, the seller already includes it, or you need the brand for resale paperwork.",
  },
  {
    title: "When a cheaper check is enough",
    body: "Screening several cars: an NMVTIS-based one-shot (~$10–15) plus free NICB + NHTSA checks, then a PPI.",
  },
  {
    title: "No report replaces a PPI",
    body: "Unreported damage and private repairs won’t show up anywhere.",
  },
];

const CARFAX_STRENGTHS = [
  "You’re down to one finalist and want the fullest service timeline you can get",
  "A dealer already includes a Carfax with the listing",
  "You’re documenting history for a private sale later",
];

const REPORT_GAPS = [
  "Accidents never filed with insurance",
  "Body work at independent shops",
  "Mechanical issues with no claim",
  "Title complications across state lines",
];

const PRICE_ROWS = [
  {
    option: "Free NICB VINCheck",
    price: "Free",
    bestFor: "Theft / total-loss flags",
    watch: "Not a full history",
    highlight: false,
  },
  {
    option: "NHTSA recall lookup",
    price: "Free",
    bestFor: "Open safety recalls",
    watch: "Recalls only",
    highlight: false,
  },
  {
    option: `NMVTIS one-shot (${BRAND.name})`,
    price: "ours" as const,
    bestFor: "Screening cars before a PPI",
    watch: "Newer brand than Carfax",
    highlight: true,
  },
  {
    option: "AutoCheck",
    price: "~$25–30 typical",
    bestFor: "Auction / score-style comparison",
    watch: "Account / score opacity",
    highlight: false,
  },
  {
    option: "Carfax",
    price: "~$40–45 typical",
    bestFor: "Service-record depth + brand recognition",
    watch: "Most expensive retail",
    highlight: false,
  },
];

const DECISIONS = [
  {
    step: "1",
    title: "Just browsing / many cars?",
    body: "Free checks first (Google the VIN, NICB, NHTSA) → cheap NMVTIS one-shot on serious candidates.",
  },
  {
    step: "2",
    title: "One finalist, dealer includes Carfax?",
    body: "Use it — still get a PPI.",
  },
  {
    step: "3",
    title: "One finalist, no report included?",
    body: "NMVTIS one-shot or Carfax depending on whether you care more about title/brand screening vs max service history.",
  },
  {
    step: "4",
    title: "Always",
    body: "Independent PPI at a shop you choose.",
  },
];

const FAQ = [
  {
    q: "Is a cheaper report fake?",
    a: "Not if it’s from an authorized NMVTIS provider. Fake/scam risk is highest with random DMs and “too cheap Carfax” resellers.",
  },
  {
    q: "Does a clean title mean the car is safe?",
    a: "No. Clean title ≠ no accidents, no flood, no bad repairs. Verify + inspect.",
  },
  {
    q: "Should I skip Carfax entirely?",
    a: "No need to. Use it when the extras matter. Don’t pay full price five times while you’re still shopping around.",
  },
  {
    q: "What’s the #1 step people skip?",
    a: "An independent pre-purchase inspection.",
  },
];

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="mt-0.5 h-4 w-4 shrink-0 text-brand-600"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.79 6.8-6.8a1 1 0 0 1 1.4 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function SampleCta({ className }: { className: string }) {
  return (
    <Link href="/sample" className={className}>
      See free sample
    </Link>
  );
}

function VinCta({ className }: { className: string }) {
  return (
    <StartReportLink className={className}>
      Check a VIN — {formatPrice()}
    </StartReportLink>
  );
}

export default function IsCarfaxWorthItPage() {
  const price = formatPrice();
  const priceRows = PRICE_ROWS.map((row) => ({
    ...row,
    price: row.price === "ours" ? price : row.price,
  }));

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <SiteHeader />

      <main className="flex-1">
        <section className="border-b border-slate-200 bg-slate-50">
          <div className="container-page py-10 sm:py-16">
            <nav className="text-sm text-slate-500">
              <Link href="/" className="hover:text-slate-900">
                Home
              </Link>
              <span className="mx-2 text-slate-300">/</span>
              <span className="text-slate-900">Is Carfax worth it?</span>
            </nav>

            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
              Vehicle history report comparison
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight text-slate-900 sm:text-5xl">
              Is Carfax Worth It in 2026?
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
              Carfax is the name most people know. That doesn&apos;t mean
              it&apos;s the only useful report — or the best spend every time
              you look at a used car.
            </p>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
              This page breaks down what Carfax is good at, what every history
              report misses, how NMVTIS fits in, and a simple decision tree so
              you don&apos;t overpay while shopping.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <SampleCta className="inline-flex items-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800" />
              <VinCta className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100" />
            </div>
            <p className="mt-4 max-w-xl text-sm text-slate-500">
              Looking for a{" "}
              <span className="font-medium text-slate-700">
                Carfax alternative
              </span>{" "}
              or a{" "}
              <span className="font-medium text-slate-700">cheap VIN check</span>
              ? Start with the{" "}
              <Link href="/sample" className="font-semibold text-brand-600 hover:underline">
                labelled sample
              </Link>
              , then run only the VINs you&apos;re serious about.
            </p>
          </div>
        </section>

        <section className="container-page py-14 sm:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
            TL;DR
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            The short version
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {TLDR.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_0_rgba(15,23,42,0.04)]"
              >
                <h3 className="text-base font-semibold text-slate-900">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-slate-200 bg-slate-50">
          <div className="container-page grid gap-8 py-14 sm:py-20 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
                Strengths
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                What Carfax is good at
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-slate-600 sm:text-base">
                Carfax built its reputation on a large private network of dealer
                and service records on top of title/brand data. That can matter
                when:
              </p>
              <ul className="mt-5 space-y-3">
                {CARFAX_STRENGTHS.map((item) => (
                  <li
                    key={item}
                    className="flex gap-3 text-sm leading-relaxed text-slate-700"
                  >
                    <CheckIcon />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-sm leading-relaxed text-slate-600">
                It&apos;s also what many buyers recognize by name — which is why
                dealers lean on it.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">
                Limits
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                What every report misses
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-slate-600 sm:text-base">
                History reports only show what someone reported. They often
                miss:
              </p>
              <ul className="mt-5 space-y-3">
                {REPORT_GAPS.map((item) => (
                  <li
                    key={item}
                    className="flex gap-3 text-sm leading-relaxed text-slate-700"
                  >
                    <span
                      className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                      aria-hidden="true"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-sm leading-relaxed text-slate-600">
                A clean report is helpful. A clean report plus an independent
                PPI is how you actually buy with confidence. Read the{" "}
                <Link
                  href="/disclaimer"
                  className="font-semibold text-brand-600 hover:underline"
                >
                  disclaimer
                </Link>{" "}
                for what any report can and cannot tell you.
              </p>
            </div>
          </div>
        </section>

        <section className="container-page py-14 sm:py-20">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
              The federal core
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              NMVTIS in plain English
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-600">
              NMVTIS is the federal National Motor Vehicle Title Information
              System. Authorized providers pull title brands and related records
              states and insurers report — salvage, junk, flood, and other
              brands, plus odometer and ownership signals that matter for a
              buying decision.
            </p>
            <p className="mt-4 text-base leading-relaxed text-slate-600">
              That federal core is what most legitimate “VIN history” products
              are built on. Price gaps between providers are often about extras
              and branding, not a totally different universe of title data.
            </p>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-slate-50">
          <div className="container-page py-14 sm:py-20">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
              Typical one-shot prices
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Price comparison
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
              A vehicle history report comparison of common options. Competitor
              prices are typical retail snapshots — always check the provider.
            </p>

            <div className="mt-8 space-y-3 md:hidden">
              {priceRows.map((row) => (
                <div
                  key={row.option}
                  className={`rounded-2xl border p-5 ${
                    row.highlight
                      ? "border-brand-200 bg-brand-50/80"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">
                      {row.option}
                    </p>
                    <p className="shrink-0 text-sm font-semibold text-slate-900">
                      {row.price}
                    </p>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">
                    <span className="font-medium text-slate-800">Best for:</span>{" "}
                    {row.bestFor}
                  </p>
                  <p className="mt-1.5 text-sm text-slate-600">
                    <span className="font-medium text-slate-800">Watch-outs:</span>{" "}
                    {row.watch}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-8 hidden overflow-hidden rounded-2xl border border-slate-200 bg-white md:block">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  Typical one-shot vehicle history report prices
                </caption>
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th scope="col" className="px-5 py-3.5">
                      Option
                    </th>
                    <th scope="col" className="px-5 py-3.5">
                      Typical price
                    </th>
                    <th scope="col" className="px-5 py-3.5">
                      Best for
                    </th>
                    <th scope="col" className="px-5 py-3.5">
                      Watch-outs
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {priceRows.map((row) => (
                    <tr
                      key={row.option}
                      className={row.highlight ? "bg-brand-50/70" : "bg-white"}
                    >
                      <th
                        scope="row"
                        className="px-5 py-4 font-semibold text-slate-900"
                      >
                        {row.option}
                      </th>
                      <td className="px-5 py-4 text-slate-700">{row.price}</td>
                      <td className="px-5 py-4 text-slate-600">{row.bestFor}</td>
                      <td className="px-5 py-4 text-slate-600">{row.watch}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-slate-500">
              Prices move — always check the provider. Avoid “$1 trial / 50
              searches” and random $5 Carfax DMs. Carfax® and AutoCheck® are
              trademarks of their respective owners. {BRAND.name} is independent
              and does not sell official Carfax reports.
            </p>
          </div>
        </section>

        <section className="container-page py-14 sm:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
            How to decide
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Decision tree
          </h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-2">
            {DECISIONS.map((item) => (
              <li
                key={item.step}
                className="rounded-2xl border border-slate-200 bg-white p-6"
              >
                <span className="font-mono text-xs font-semibold tracking-widest text-brand-500">
                  {item.step.padStart(2, "0")}
                </span>
                <h3 className="mt-3 text-lg font-semibold tracking-tight text-slate-900">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {item.body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section className="bg-ink-950">
          <div className="container-page relative overflow-hidden py-14 sm:py-20">
            <div className="hero-aurora absolute inset-0 opacity-70" aria-hidden="true" />
            <div className="relative max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">
                How {BRAND.name} fits
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                A {price} one-shot, not a $45 habit
              </h2>
              <p className="mt-4 text-base leading-relaxed text-slate-300">
                We sell a {price} one-shot report — NMVTIS-based title/history, a
                plain-English AI brief, plus NHTSA safety stars and EPA ownership
                context. No subscription.
              </p>
              <p className="mt-4 text-sm leading-relaxed text-slate-400">
                See{" "}
                <Link
                  href="/#how-it-works"
                  className="font-semibold text-brand-300 hover:text-brand-200"
                >
                  how it works
                </Link>{" "}
                on the homepage, or jump straight to checkout.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <SampleCta className="inline-flex items-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100" />
                <VinCta className="inline-flex items-center rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-glow transition hover:bg-brand-500" />
              </div>
              <p className="mt-5 text-sm leading-relaxed text-slate-400">
                Screen cars without burning $45 a pop. Start with the sample,
                then run the VINs you&apos;re serious about.
              </p>
            </div>
          </div>
        </section>

        <section className="container-page scroll-mt-20 py-14 sm:py-20">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.6fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
                FAQ
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                Common questions
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-slate-600">
                Still deciding? Read the{" "}
                <Link
                  href="/disclaimer"
                  className="font-semibold text-brand-600 hover:underline"
                >
                  disclaimer
                </Link>{" "}
                and the{" "}
                <Link href="/sample" className="font-semibold text-brand-600 hover:underline">
                  sample report
                </Link>
                {" "}
                (labelled SAMPLE) before you pay.
              </p>
            </div>

            <div className="divide-y divide-slate-200 border-y border-slate-200">
              {FAQ.map((item) => (
                <details key={item.q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-base font-semibold text-slate-900">
                    {item.q}
                    <span className="mt-1 shrink-0 text-slate-400 transition group-open:rotate-45">
                      <svg
                        viewBox="0 0 20 20"
                        aria-hidden="true"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      >
                        <path d="M10 4v12M4 10h12" />
                      </svg>
                    </span>
                  </summary>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
                    {item.a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
