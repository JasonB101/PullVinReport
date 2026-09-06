import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CheckoutPanel } from "@/components/checkout-panel";
import { SampleTeaser } from "@/components/sample-teaser";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { VinForm } from "@/components/vin-form";
import {
  formatPrice,
  isStripeConfigured,
  isVinAuditConfigured,
  missingVinAuditKeys,
} from "@/lib/config";
import { modelYearFromVin, prettyVin, validateVin } from "@/lib/vin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirm your VIN",
  description:
    "Confirm your VIN and preview the report format before paying.",
  robots: { index: false, follow: false },
};

/** Explains, in plain language, why ordering is disabled on this deployment. */
function orderingAvailability(): { available: boolean; reason?: string } {
  const problems: string[] = [];
  if (!isVinAuditConfigured()) {
    problems.push(
      `the vehicle-data provider is not connected (missing ${missingVinAuditKeys().join(", ")})`,
    );
  }
  if (!isStripeConfigured()) {
    problems.push("payments are not connected (missing STRIPE_SECRET_KEY)");
  }
  if (problems.length === 0) return { available: true };
  return {
    available: false,
    reason: `On this deployment ${problems.join(" and ")}.`,
  };
}

export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ vin?: string }>;
}) {
  const params = await searchParams;
  const result = validateVin(params.vin ?? "");

  if (!result.valid) {
    return (
      <div className="flex min-h-dvh flex-col bg-slate-50">
        <SiteHeader />
        <main className="container-page flex-1 py-16">
          <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-7 shadow-card">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              That VIN doesn&apos;t look right
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {result.error ?? "Enter a valid 17-character VIN to continue."}
            </p>
            <div className="mt-6">
              <VinForm initialVin={params.vin ?? ""} autoFocus />
            </div>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }

  // Keep the URL canonical so shared links always carry the normalized VIN.
  if (params.vin !== result.vin) {
    redirect(`/preview?vin=${encodeURIComponent(result.vin)}`);
  }

  const { available, reason } = orderingAvailability();
  const modelYear = modelYearFromVin(result.vin);

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <SiteHeader />

      <main className="flex-1">
        <div className="border-b border-slate-200 bg-white">
          <div className="container-page py-10 sm:py-12">
            <nav className="text-sm text-slate-500">
              <Link href="/" className="hover:text-slate-900">
                Home
              </Link>
              <span className="mx-2 text-slate-300">/</span>
              <span className="text-slate-900">Confirm VIN</span>
            </nav>

            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
                  Step 1 of 2 · Confirm
                </p>
                <h1 className="mt-2 font-mono text-2xl tracking-[0.14em] text-slate-900 sm:text-3xl">
                  {prettyVin(result.vin)}
                </h1>
                <p className="mt-2 text-sm text-slate-600">
                  Valid 17-character VIN
                  {modelYear ? ` · likely a ${modelYear} model year` : ""}. We
                  pull the records only after payment clears.
                </p>
              </div>
              <Link
                href="/"
                className="text-sm font-semibold text-brand-600 hover:text-brand-700"
              >
                Use a different VIN
              </Link>
            </div>

            {result.warning && (
              <p className="mt-5 max-w-2xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {result.warning}
              </p>
            )}
          </div>
        </div>

        <div className="container-page py-10 sm:py-14">
          <div className="grid gap-10 lg:grid-cols-[1.35fr_1fr] lg:items-start">
            <div className="space-y-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">
                  What your report will look like
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                  This preview is a sample — not your vehicle
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                  The panels below come from our fictional example report. They
                  show the structure you will receive for{" "}
                  <span className="font-mono text-slate-900">{result.vin}</span>{" "}
                  once payment clears. We never present sample data as your
                  result.
                </p>
              </div>

              <SampleTeaser />

              <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
                <h3 className="text-base font-semibold tracking-tight text-slate-900">
                  Before you pay, know this
                </h3>
                <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600">
                  <li>
                    A history report reflects what has been{" "}
                    <span className="font-medium text-slate-900">reported</span>{" "}
                    to states, insurers and auctions. Unreported damage will not
                    appear.
                  </li>
                  <li>
                    Coverage is strongest for US vehicles from roughly 1981
                    onward. Imports and very new vehicles may return little.
                  </li>
                  <li>
                    If the provider returns no usable report for your VIN, email
                    support and we will refund you.
                  </li>
                  <li>
                    A report is informational only and is not a substitute for
                    an in-person inspection. See the{" "}
                    <Link href="/disclaimer" className="font-semibold text-brand-600 hover:underline">
                      disclaimer
                    </Link>
                    .
                  </li>
                </ul>
              </div>
            </div>

            <div className="lg:sticky lg:top-24">
              <CheckoutPanel
                vin={result.vin}
                priceLabel={formatPrice()}
                available={available}
                unavailableReason={reason}
              />
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
