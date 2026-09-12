import type { Metadata } from "next";
import Link from "next/link";

import { SampleTeaser } from "@/components/sample-teaser";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { StartReportLink } from "@/components/start-report-link";
import { VinForm } from "@/components/vin-form";
import { BRAND, formatPrice } from "@/lib/config";

export const dynamic = "force-dynamic";

const PATH = "/is-carfax-worth-it";
const PAGE_TITLE = "Is Carfax Worth It in 2026? (Honest Comparison)";
const PAGE_DESCRIPTION =
  "An honest 2026 comparison of Carfax, AutoCheck, and an independent VIN report: typical prices, what every history report misses, and when a cheaper one-time report is enough.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PATH },
  keywords: [
    "is Carfax worth it",
    "Carfax vs vehicle history report",
    "Carfax price 2026",
    "NMVTIS",
    "VIN history report",
    "AutoCheck vs Carfax",
  ],
  openGraph: {
    type: "article",
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: PATH,
  },
  twitter: {
    card: "summary_large_image",
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
  },
};

const CARFAX_STRENGTHS = [
  {
    title: "Participating service records",
    body: "Carfax is unusually strong here. When a dealer or shop that shares records with them has worked on the car, you may see oil changes, brake jobs and campaign work that a title-and-insurance report will not show.",
  },
  {
    title: "A name buyers already know",
    body: "Sellers, shoppers and some lenders recognise the brand. If someone has asked for “a Carfax” by name, handing them that report removes an argument you do not need to have.",
  },
  {
    title: "Often already on the listing",
    body: "Many franchise and independent dealers pay for Carfax at wholesale and attach a recent report to the online listing. If that report is current and opens on Carfax’s own site, you may not need to buy another one to screen that car.",
  },
  {
    title: "Accident and insurance partnerships",
    body: "Decades of insurer and auction relationships mean Carfax often surfaces reported collisions, airbag deployments and total-loss events. That layer is useful. It is still only what someone filed.",
  },
];

const EVERY_REPORT_MISSES = [
  {
    title: "Accidents nobody reported",
    body: "Private-party cash repairs, parking-lot dings, and claims that never reached an insurer do not appear on Carfax, AutoCheck, or our report.",
  },
  {
    title: "Whether the car is actually sound",
    body: "No VIN report is a compression test, a lift inspection, or a test drive. A clean history can sit on a car with a tired transmission.",
  },
  {
    title: "Flood, hail and frame work done quietly",
    body: "If the owner never filed a claim and the title was never branded, the paperwork can look fine while the metal is not.",
  },
  {
    title: "Late, missing or washed titles",
    body: "States report on their own clocks. A salvage brand can lag, and title washing is the reason you still read the records and then look at the car.",
  },
  {
    title: "The seller’s ability to transfer it",
    body: "A report can flag a recorded lien. It cannot promise the person in the driveway can sign the title over this afternoon.",
  },
  {
    title: "How it drives this week",
    body: "Overheating, a misfire, a reconstructed airbag — those are mechanic questions. Pair every report with a pre-purchase inspection (PPI).",
  },
];

const DECISION = [
  {
    if: "The dealer listing already includes a recent official Carfax",
    then: "Read that one. Confirm it is current and that it is the real report, not a screenshot. Still book a PPI.",
  },
  {
    if: "A lender or buyer asked for Carfax by name",
    then: "Buy that brand so you can hand them exactly what they asked for. An independent report will not satisfy a literal “send me the Carfax” request.",
  },
  {
    if: "You specifically want participating-dealer service history",
    then: "Carfax is usually the stronger product for that layer. We do not claim their service-record network.",
  },
  {
    if: "You are screening one or two private-party cars and want a one-time report",
    then: "Start with our labelled sample, then enter the VIN on the homepage. You will see the vehicle before you pay.",
  },
];

function faqItems(price: string) {
  return [
    {
      q: "Are you affiliated with Carfax or AutoCheck?",
      a: `No. ${BRAND.name} is independent. We are not Carfax, AutoCheck or any other retail brand. We are not affiliated with, endorsed by, or sponsored by any other vehicle history reporting company, manufacturer, or government agency.`,
    },
    {
      q: "Is a cheaper report less accurate?",
      a: "Price is not a completeness score. Title brands, salvage and junk records, and many insurance total-loss events sit on the same federal NMVTIS system that serious US history products draw from. What you mainly pay a premium for at retail is brand recognition and, in Carfax’s case, participating service records. Two honest reports can still disagree when a source reported to one network and not the other.",
    },
    {
      q: "Does a clean report mean the car is fine?",
      a: "No. A clean report is not a clean car. A report only shows what has been reported to the sources behind it. Plenty of accidents are never filed with an insurer or a state. Always pair a history report with an in-person pre-purchase inspection by a mechanic you trust.",
    },
    {
      q: "Should I still buy a Carfax if I already have your report?",
      a: "Sometimes. If you want participating service records, or someone has asked for Carfax by name, buy that report too. If you already have a recent official Carfax from the dealer, you may not need ours for that same VIN — use the sample to decide whether our layout is useful to you.",
    },
    {
      q: "What is NMVTIS, and why does it keep coming up?",
      a: "NMVTIS is the National Motor Vehicle Title Information System, a federal database of title, salvage, junk and insurance total-loss records. Consumer reports add commercial sources on top of it. It is the backbone, not a guarantee that every event was filed.",
    },
    {
      q: "Do you include service records?",
      a: "We do not advertise a Carfax-style participating-dealer service history. Our paid report is built around title and brand records reported to NMVTIS together with insurance, salvage, auction and listing records, plus open safety recalls. If service history is the thing you came for, Carfax is the usual place to look.",
    },
    {
      q: "Is this a subscription?",
      a: `No. One payment of ${price} buys one report for one VIN. There is nothing to cancel and we never store your card — Stripe handles payment end to end.`,
    },
    {
      q: "Can I see a report before I pay?",
      a: "Yes. We publish a complete, clearly labelled sample so you can judge the depth and layout. It is marked SAMPLE on every screen and is never served in place of a report you paid for.",
    },
  ];
}

function jsonLd(price: string) {
  const url = `${BRAND.url}${PATH}`;
  const faq = faqItems(price);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#page`,
        url,
        name: PAGE_TITLE,
        description: PAGE_DESCRIPTION,
        isPartOf: {
          "@type": "WebSite",
          name: BRAND.name,
          url: BRAND.url,
        },
        about: ["Carfax", "vehicle history report", "NMVTIS"],
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: BRAND.url },
          { "@type": "ListItem", position: 2, name: PAGE_TITLE, item: url },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: faq.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    ],
  };
}

export default function IsCarfaxWorthItPage() {
  const price = formatPrice();
  const faq = faqItems(price);

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader variant="on-dark" />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd(price)).replace(/</g, "\\u003c"),
        }}
      />

      <main className="flex-1">
        <section className="relative overflow-hidden bg-ink-950">
          <div className="hero-aurora absolute inset-0" aria-hidden="true" />
          <div className="grid-lines absolute inset-0 opacity-40" aria-hidden="true" />
          <div
            className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-white"
            aria-hidden="true"
          />

          <div className="container-page relative pb-24 pt-10 sm:pb-32 sm:pt-16">
            <nav className="text-sm text-slate-400">
              <Link href="/" className="hover:text-white">
                Home
              </Link>
              <span className="mx-2 text-slate-600">/</span>
              <span className="text-slate-200">Is Carfax worth it</span>
            </nav>

            <div className="mx-auto mt-8 max-w-3xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-medium text-brand-100 ring-1 ring-inset ring-white/15">
                Honest comparison · 2026
              </span>
              <h1 className="mt-6 text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl">
                {PAGE_TITLE}
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
                Carfax is a serious product with a real advantage on
                participating service records. It is also typically the
                expensive way to buy a single VIN report at retail. Here is when
                that premium is worth it, what every history report misses, and
                how an independent {price} report fits — without a fake review
                in sight.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/sample"
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
                >
                  Read the sample report
                </Link>
                <StartReportLink className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
                  Check a VIN
                </StartReportLink>
              </div>
              <p className="mt-4 text-xs text-slate-400">
                Reports {price} · one-time. You&apos;ll see the vehicle before
                you pay. We are not affiliated with Carfax or AutoCheck.
              </p>
            </div>
          </div>
        </section>

        <section id="tldr" className="container-page scroll-mt-20 py-16 sm:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
            TL;DR
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Short answers, then the nuance
          </h2>
          <ul className="mt-8 grid gap-5 sm:grid-cols-2">
            {[
              {
                title: "Carfax is worth it when…",
                body: "You need participating service records, a lender asked for that brand by name, or a dealer already included a recent official report.",
              },
              {
                title: "A one-time report is enough when…",
                body: `You are screening a private-party VIN for title brands, salvage, odometer, reported accidents, liens, listings and recalls — and you want one ${price} payment, not a pack or a subscription.`,
              },
              {
                title: "A clean report is not a clean car",
                body: "Absence of a record is not evidence that nothing happened. Always get a pre-purchase inspection. That is true of Carfax, AutoCheck and us.",
              },
              {
                title: "We are not Carfax",
                body: `${BRAND.name} is independent. Third-party names on this page are used only to describe the market, not to imply endorsement.`,
              },
            ].map((item) => (
              <li
                key={item.title}
                className="rounded-2xl border border-slate-200 bg-white p-5"
              >
                <h3 className="text-sm font-semibold text-slate-900">
                  {item.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                  {item.body}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section
          id="carfax-strengths"
          className="border-y border-slate-200 bg-slate-50"
        >
          <div className="container-page py-16 sm:py-24">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
                What Carfax is good at
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                A fair list, not a hit piece
              </h2>
              <p className="mt-4 text-base leading-relaxed text-slate-600">
                Bashing Carfax helps nobody who is about to write a cheque for a
                used car. They earned the default slot on dealer lots. These are
                the reasons people keep paying the typical retail premium.
              </p>
            </div>
            <div className="mt-10 grid gap-5 sm:grid-cols-2">
              {CARFAX_STRENGTHS.map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-slate-200 bg-white p-5"
                >
                  <h3 className="text-sm font-semibold text-slate-900">
                    {item.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="what-reports-miss" className="container-page py-16 sm:py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
              What every report misses
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              The same gaps, no matter whose logo is on the PDF
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-600">
              This is the part comparison pages skip because it does not sell
              reports. It is also the part that actually protects you.
            </p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {EVERY_REPORT_MISSES.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-slate-200 bg-white p-5"
              >
                <h3 className="text-sm font-semibold text-slate-900">
                  {item.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-8 max-w-3xl rounded-2xl border border-amber-200 bg-amber-50/80 p-5 text-sm leading-relaxed text-amber-950">
            A clean report is not proof of a clean vehicle. Read the{" "}
            <Link href="/disclaimer" className="font-semibold underline">
              disclaimer
            </Link>{" "}
            — it is the same rule we print on every paid report.
          </p>
        </section>

        <section id="nmvtis" className="border-y border-slate-200 bg-slate-50">
          <div className="container-page py-16 sm:py-24">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
                NMVTIS explained
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                The federal title system sitting under the brand names
              </h2>
              <p className="mt-4 text-base leading-relaxed text-slate-600">
                NMVTIS — the National Motor Vehicle Title Information System —
                is a US federal database. States, insurers and salvage yards
                report title brands, junk and salvage dispositions, and many
                insurance total-loss events into it. It exists so a car
                destroyed in one state is harder to retitle as clean in another.
              </p>
              <p className="mt-4 text-base leading-relaxed text-slate-600">
                Serious consumer history products sit on top of that system and
                then add commercial sources: insurer claims, auctions, listing
                archives, recalls. Carfax’s distinctive extra is the
                participating service-record network. AutoCheck (an Experian
                product) is known for a score on top of history. We sell one
                independent report: title and brand records reported to NMVTIS
                together with insurance, salvage, auction and listing records,
                plus open safety recalls and a written brief.
              </p>
              <p className="mt-4 text-base leading-relaxed text-slate-600">
                NMVTIS is not a magic wand. If nobody reported the event, it is
                not in the system. That is why a pre-purchase inspection is not
                optional.
              </p>
            </div>
          </div>
        </section>

        <section id="price" className="container-page py-16 sm:py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
              Price comparison
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Typical retail ranges, not a live price list
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-600">
              Other companies change packs, promos and checkout prices. The
              numbers below are typical ranges shoppers see at retail in 2026,
              labelled <span className="font-semibold">typically</span> on
              purpose. Check the seller’s own checkout for the figure you would
              actually pay.
            </p>
          </div>

          <div className="mt-10 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="min-w-[44rem] text-left text-sm">
              <caption className="sr-only">
                Typical 2026 retail prices for Carfax, AutoCheck, and{" "}
                {BRAND.name}
              </caption>
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-3.5">
                    Report
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    Typical price
                  </th>
                  <th scope="col" className="px-5 py-3.5">
                    What you are usually paying for
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                <tr>
                  <th scope="row" className="px-5 py-4 font-semibold text-slate-900">
                    Carfax, one VIN
                  </th>
                  <td className="px-5 py-4">typically about $40–$45</td>
                  <td className="px-5 py-4">
                    Brand-name report; strongest on participating service
                    records
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="px-5 py-4 font-semibold text-slate-900">
                    Carfax, multi-pack
                  </th>
                  <td className="px-5 py-4">typically about $60–$110 for a pack</td>
                  <td className="px-5 py-4">
                    Lower per-VIN cost if you will actually use the extra
                    reports
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="px-5 py-4 font-semibold text-slate-900">
                    AutoCheck, one VIN
                  </th>
                  <td className="px-5 py-4">typically about $25</td>
                  <td className="px-5 py-4">
                    Experian report; often a score plus history
                  </td>
                </tr>
                <tr className="bg-brand-50/70">
                  <th scope="row" className="px-5 py-4 font-semibold text-slate-900">
                    {BRAND.name}
                  </th>
                  <td className="px-5 py-4 font-semibold text-slate-900">
                    {price}, one-time
                  </td>
                  <td className="px-5 py-4">
                    Independent single-VIN report. No subscription, no pack to
                    finish.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            Dealer-attached Carfax reports are typically paid by the dealer, not
            by you. That is a different transaction from buying one report at
            consumer checkout.
          </p>
        </section>

        <section id="decision" className="border-y border-slate-200 bg-slate-50">
          <div className="container-page py-16 sm:py-24">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
                Decision tree
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                Pick the report that matches the job
              </h2>
              <p className="mt-4 text-base leading-relaxed text-slate-600">
                Work top to bottom. The last step is the same on every branch.
              </p>
            </div>
            <ol className="mt-10 grid gap-5">
              {DECISION.map((step, index) => (
                <li
                  key={step.if}
                  className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-[auto_1fr]"
                >
                  <span className="font-mono text-xs font-semibold tracking-widest text-brand-500">
                    0{index + 1}
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      If
                    </p>
                    <h3 className="mt-1 text-base font-semibold tracking-tight text-slate-900">
                      {step.if}
                    </h3>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Then
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                      {step.then}
                    </p>
                  </div>
                </li>
              ))}
              <li className="rounded-2xl border border-slate-900 bg-ink-950 p-5 text-slate-200">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">
                  On every branch
                </p>
                <p className="mt-2 text-base font-semibold tracking-tight text-white">
                  Pay a mechanic you trust to inspect the actual car.
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  A history report tells you where to look harder. It does not
                  tell you whether the timing chain is about to fail.
                </p>
              </li>
            </ol>
          </div>
        </section>

        <section id="how-we-fit" className="container-page py-16 sm:py-24">
          <div className="grid items-start gap-12 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
                How {BRAND.shortName} fits
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                One VIN, one {price} report, no subscription
              </h2>
              <p className="mt-4 text-base leading-relaxed text-slate-600">
                {BRAND.name} is for the shopper who wants to identify the
                vehicle first, then pull title brands, salvage and junk records,
                odometer history, reported accidents, liens, prior listings and
                open recalls — readable in about a minute, with a written brief
                on every paid report.
              </p>
              <ul className="mt-6 space-y-3 text-sm leading-relaxed text-slate-600">
                {[
                  `${price} through Stripe. One-time. Nothing to cancel.`,
                  "Enter the VIN on the homepage. You see year, make and model before you pay.",
                  "A complete labelled sample so you can judge the layout first.",
                  "We do not claim Carfax’s participating service-record network.",
                  "We are not affiliated with Carfax, AutoCheck, or any manufacturer or agency.",
                ].map((line) => (
                  <li key={line} className="flex gap-2.5">
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
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/sample"
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  View the full sample report
                </Link>
                <StartReportLink className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
                  Check my VIN
                </StartReportLink>
              </div>
            </div>
            <SampleTeaser />
          </div>
        </section>

        <section id="faq" className="border-t border-slate-200 bg-slate-50">
          <div className="container-page scroll-mt-20 py-16 sm:py-24">
            <div className="grid gap-12 lg:grid-cols-[1fr_1.6fr]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
                  FAQ
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                  Straight answers
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-slate-600">
                  Still unsure? The{" "}
                  <Link
                    href="/disclaimer"
                    className="font-semibold text-brand-600 hover:underline"
                  >
                    disclaimer
                  </Link>{" "}
                  spells out what a history report can and cannot tell you.
                </p>
              </div>
              <div className="divide-y divide-slate-200 border-y border-slate-200">
                {faq.map((item) => (
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
          </div>
        </section>

        <section className="border-t border-slate-200 bg-white">
          <div className="container-page py-16 text-center sm:py-20">
            <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              {BRAND.tagline}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-slate-600">
              Enter a VIN on the homepage checkout to identify the car. Reports
              are {price}, one-time. Or{" "}
              <Link
                href="/sample"
                className="font-semibold text-brand-600 hover:underline"
              >
                read the sample
              </Link>{" "}
              first.
            </p>
            <div className="mx-auto mt-8 max-w-xl">
              <VinForm variant="on-light" />
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}