import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { CheckoutPanel } from "@/components/checkout-panel";
import { SampleTeaser } from "@/components/sample-teaser";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { VinDecodeCard, VinDecodeSkeleton } from "@/components/vin-decode-card";
import { VinForm } from "@/components/vin-form";
import {
  formatPrice,
  isStripeConfigured,
  isVinAuditConfigured,
} from "@/lib/config";
import {
  ORDERING_PAUSED_REASON,
  PAYMENT_CANCELED_MESSAGE,
} from "@/lib/customer-copy";
import { modelYearFromVin, prettyVin, validateVin } from "@/lib/vin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirm your VIN",
  description:
    "Confirm your VIN and preview the report format before paying.",
  robots: { index: false, follow: false },
};

/**
 * Whether a customer can buy right now.
 *
 * Which credential is missing is an operator concern, so the buyer gets one
 * calm sentence and a link to `/status` rather than our configuration.
 */
function orderingAvailability(): { available: boolean; reason?: string } {
  if (isVinAuditConfigured() && isStripeConfigured()) return { available: true };
  return { available: false, reason: ORDERING_PAUSED_REASON };
}

export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ vin?: string; canceled?: string }>;
}) {
  const params = await searchParams;
  const result = validateVin(params.vin ?? "");
  // Stripe's cancel_url sends the buyer back here with canceled=1.
  const canceled = params.canceled === "1";

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
    redirect(
      `/preview?vin=${encodeURIComponent(result.vin)}${canceled ? "&canceled=1" : ""}`,
    );
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

            {/* Streamed so a slow decode never delays the checkout panel. */}
            <Suspense fallback={<VinDecodeSkeleton />}>
              <VinDecodeCard vin={result.vin} />
            </Suspense>

            {canceled && (
              <div
                role="status"
                className="mt-5 max-w-2xl rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700"
              >
                <span className="font-semibold text-slate-900">
                  Payment canceled — you have not been charged.
                </span>{" "}
                {PAYMENT_CANCELED_MESSAGE}
              </div>
            )}

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
                    If no usable report comes back for your VIN, email support
                    and we will refund you.
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
                canceled={canceled}
              />
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
