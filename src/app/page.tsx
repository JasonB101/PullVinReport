import Link from "next/link";

import { SampleTeaser } from "@/components/sample-teaser";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { VinForm } from "@/components/vin-form";
import { BRAND, formatPrice } from "@/lib/config";

export const dynamic = "force-dynamic";

const INCLUDED = [
  {
    title: "Title & brand history",
    body: "Every title record on file, plus salvage, junk, flood, lemon and rebuilt brands reported to NMVTIS.",
    icon: "M4 6h16M4 12h16M4 18h10",
  },
  {
    title: "Odometer readings",
    body: "Mileage captured at each title event, charted so a rollback or an implausible jump is obvious.",
    icon: "M12 20a8 8 0 1 0-8-8m8 8 4-9",
  },
  {
    title: "Accident & damage",
    body: "Reported collisions and damage events, including severity and affected areas where available.",
    icon: "m3 18 3-7 4 3 4-8 4 5 3-2",
  },
  {
    title: "Theft & recovery",
    body: "Active theft records so you don't buy a vehicle you can't legally keep.",
    icon: "M12 3 4 6v6c0 4.5 3.2 8.3 8 9 4.8-.7 8-4.5 8-9V6Z",
  },
  {
    title: "Liens & repossessions",
    body: "Financial interests recorded against the VIN, so you know the seller can actually transfer it.",
    icon: "M4 10h16M6 10V6l6-3 6 3v4M5 20h14M7 10v10M17 10v10",
  },
  {
    title: "Impounds & exports",
    body: "Impound events and records showing the vehicle was exported out of the country.",
    icon: "M3 12h18M12 3v18",
  },
  {
    title: "Prior sales listings",
    body: "Historic retail and auction listings with asking prices, so you can judge today's number.",
    icon: "M4 19V5m0 14h16M8 15V9m4 6V7m4 8v-4",
  },
  {
    title: "Open safety recalls",
    body: "Manufacturer recall campaigns that apply to this vehicle, with the remedy and component.",
    icon: "M12 9v4m0 4h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  },
];

const STEPS = [
  {
    step: "01",
    title: "Enter the VIN",
    body: "Type or paste the 17-character VIN. We validate the format and check digit instantly — no charge, no account.",
  },
  {
    step: "02",
    title: "Look at the sample first",
    body: "See a clearly labelled example report so you know exactly what a real report contains before you spend a cent.",
  },
  {
    step: "03",
    title: "Pay once, read immediately",
    body: `${formatPrice()} through Stripe. We pull the records, open your report on screen, and email you a private link.`,
  },
];

const FAQ = [
  {
    q: "Where does the data come from?",
    a: "Every purchased report is pulled live from the VinAudit Vehicle History API, which aggregates NMVTIS title and brand data along with insurance, salvage, auction and listing sources. We do not resell another retailer's report and we do not repackage the sample.",
  },
  {
    q: "How fast do I get it?",
    a: "As soon as your payment is confirmed we pull the report and open it on screen — usually within a few seconds. A private link is emailed to you at the same time.",
  },
  {
    q: "Does a clean report mean the car is fine?",
    a: "No. A report only shows what has been reported to the sources behind it. Plenty of accidents are never filed with an insurer or a state. Always pair a history report with an in-person inspection by a mechanic you trust.",
  },
  {
    q: "Is this a subscription?",
    a: `No. One payment of ${formatPrice()} buys one report for one VIN. There is nothing to cancel and we never store your card — Stripe handles payment end to end.`,
  },
  {
    q: "What if the provider has no records for my VIN?",
    a: "Some VINs — especially very new, very old, or non-US vehicles — return little or nothing. If we cannot deliver a report for your VIN, email support and we will refund you.",
  },
  {
    q: "Are you affiliated with any other vehicle history brand?",
    a: `No. ${BRAND.name} is independent. We are not affiliated with, endorsed by, or sponsored by any other vehicle history reporting company, manufacturer, or government agency.`,
  },
];

function Icon({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );
}

export default function HomePage() {
  const price = formatPrice();

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader variant="on-dark" />

      <main className="flex-1">
        {/* Hero -------------------------------------------------------- */}
        <section id="vin" className="relative overflow-hidden bg-ink-950">
          <div className="hero-aurora absolute inset-0" aria-hidden="true" />
          <div className="grid-lines absolute inset-0 opacity-40" aria-hidden="true" />
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-white" aria-hidden="true" />

          {/* Extra bottom padding keeps the trust row clear of the white fade. */}
          <div className="container-page relative pb-32 pt-14 sm:pb-40 sm:pt-24">
            <div className="mx-auto max-w-3xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-medium text-brand-100 ring-1 ring-inset ring-white/15">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Powered by the VinAudit Vehicle History API
              </span>

              <h1 className="mt-6 text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-6xl">
                Know the whole story
                <span className="block bg-gradient-to-r from-brand-300 via-brand-400 to-cyan-300 bg-clip-text text-transparent">
                  before you buy the car.
                </span>
              </h1>

              <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
                One VIN. One {price} report. Title brands, salvage and junk
                records, odometer history, accidents, liens, prior listings and
                open recalls — pulled live and readable in under a minute.
              </p>

              <div className="mx-auto mt-9 max-w-2xl">
                <VinForm variant="on-dark" autoFocus />
              </div>

              <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-xs text-slate-400">
                {[
                  "See a labelled sample before you pay",
                  "Secure Stripe checkout",
                  "One-time payment, no subscription",
                ].map((item) => (
                  <span key={item} className="inline-flex items-center gap-1.5">
                    <svg
                      viewBox="0 0 20 20"
                      aria-hidden="true"
                      className="h-3.5 w-3.5 text-emerald-400"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.79 6.8-6.8a1 1 0 0 1 1.4 0Z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* What's included --------------------------------------------- */}
        <section className="container-page py-16 sm:py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
              What you get
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Everything in one report, nothing held back for an upsell
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-600">
              There is one product and one price. Whatever the provider returns
              for your VIN, you see all of it.
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {INCLUDED.map((item) => (
              <div
                key={item.title}
                className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-brand-200 hover:shadow-card"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-600 group-hover:text-white">
                  <Icon path={item.icon} />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-slate-900">
                  {item.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Sample ------------------------------------------------------- */}
        <section className="border-y border-slate-200 bg-slate-50">
          <div className="container-page py-16 sm:py-24">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">
                  Try before you buy
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                  Read a full sample report first
                </h2>
                <p className="mt-4 text-base leading-relaxed text-slate-600">
                  We publish a complete, clearly labelled sample report so you
                  can judge the depth and layout before paying. It is marked{" "}
                  <span className="font-semibold text-amber-700">SAMPLE</span> on
                  every screen, and its fictional data is never served in place
                  of a report you paid for.
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <Link
                    href="/sample"
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    View the full sample report
                  </Link>
                  <Link
                    href="#vin"
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    Check my VIN
                  </Link>
                </div>
              </div>

              <SampleTeaser />
            </div>
          </div>
        </section>

        {/* How it works -------------------------------------------------- */}
        <section id="how-it-works" className="container-page scroll-mt-20 py-16 sm:py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
              How it works
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Three steps, about a minute
            </h2>
          </div>

          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((step) => (
              <li
                key={step.step}
                className="relative rounded-2xl border border-slate-200 bg-white p-6"
              >
                <span className="font-mono text-xs font-semibold tracking-widest text-brand-500">
                  {step.step}
                </span>
                <h3 className="mt-3 text-lg font-semibold tracking-tight text-slate-900">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* Pricing ------------------------------------------------------- */}
        <section id="pricing" className="scroll-mt-20 bg-ink-950">
          <div className="container-page relative overflow-hidden py-16 sm:py-24">
            <div className="hero-aurora absolute inset-0 opacity-70" aria-hidden="true" />
            <div className="relative mx-auto max-w-xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">
                Pricing
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                One report. One price.
              </h2>

              <div className="mt-9 rounded-3xl border border-white/15 bg-white/5 p-8 backdrop-blur">
                <div className="flex items-end justify-center gap-2">
                  <span className="text-5xl font-semibold tracking-tight text-white">
                    {price}
                  </span>
                  <span className="pb-2 text-sm text-slate-400">per VIN</span>
                </div>
                <p className="mt-3 text-sm text-slate-300">
                  Full report, delivered on screen and by email. No account
                  required, no recurring charge, no upsell tiers.
                </p>
                <Link
                  href="#vin"
                  className="mt-7 block w-full rounded-xl bg-brand-600 px-6 py-4 text-base font-semibold text-white shadow-glow transition hover:bg-brand-500"
                >
                  Enter a VIN
                </Link>
                <p className="mt-4 text-xs text-slate-400">
                  If we can&apos;t return a report for your VIN, email us and we
                  will refund you.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ ----------------------------------------------------------- */}
        <section id="faq" className="container-page scroll-mt-20 py-16 sm:py-24">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.6fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
                FAQ
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                Straight answers
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-slate-600">
                Still unsure? Read the{" "}
                <Link href="/disclaimer" className="font-semibold text-brand-600 hover:underline">
                  disclaimer
                </Link>{" "}
                — it spells out exactly what a history report can and cannot
                tell you.
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

        {/* Closing CTA ---------------------------------------------------- */}
        <section className="border-t border-slate-200 bg-slate-50">
          <div className="container-page py-16 text-center sm:py-20">
            <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              {BRAND.tagline}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-slate-600">
              Spend {price} now instead of thousands later.
            </p>
            <div className="mx-auto mt-8 max-w-xl">
              <VinForm variant="on-light" submitLabel="Get my report" />
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
