import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { GoogleAdsPurchase } from "@/components/google-ads-purchase";
import { ReportActions } from "@/components/report-actions";
import { ReportView } from "@/components/report-view";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { emailConfig, formatPrice, isFalConfigured } from "@/lib/config";
import {
  classifyFailure,
  customerFailureMessage,
  refundPromise,
} from "@/lib/customer-copy";
import { extrasForReport } from "@/lib/model-extras";
import { cachedHeroForReport } from "@/lib/order-hero";
import { paidReportPdfPath } from "@/lib/report-pdf-serve";
import { withCurrentLayout } from "@/lib/report-layout";
import { getStore } from "@/lib/store";
import type { Order } from "@/lib/store";
import { prettyVin } from "@/lib/vin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your vehicle history report",
  robots: { index: false, follow: false },
};

function Shell({
  title,
  order,
  children,
}: {
  title: string;
  order: Order;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <SiteHeader cta="another" />
      <main className="container-page flex-1 py-16">
        <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-7 shadow-card">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {title}
          </h1>
          <p className="mt-2 font-mono text-sm tracking-wider text-slate-500">
            {prettyVin(order.vin)}
          </p>
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-slate-600">
            {children}
          </div>
          <p className="mt-6 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
            Order reference{" "}
            <span className="font-mono text-slate-700">{order.id}</span> ·{" "}
            <a
              className="font-semibold text-brand-600 hover:underline"
              href={`mailto:${emailConfig.supportEmail}`}
            >
              {emailConfig.supportEmail}
            </a>
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { token } = await params;
  const { new: isNew } = await searchParams;

  const store = getStore();
  await store.init();
  const order = await store.getByAccessToken(token);

  if (!order) notFound();

  if (order.status === "pending" || order.status === "expired") {
    return (
      <Shell title="This order hasn't been paid" order={order}>
        <p>
          We created this order but never received a completed payment, so no
          report was pulled. Nothing has been charged.
        </p>
        <p>
          <Link
            href={`/preview?vin=${encodeURIComponent(order.vin)}`}
            className="font-semibold text-brand-600 hover:underline"
          >
            Start again for this VIN
          </Link>
        </p>
      </Shell>
    );
  }

  if (order.status === "paid" && !order.report) {
    return (
      <Shell title="We're pulling your report" order={order}>
        <p>
          Your payment cleared and we are retrieving your records now. This
          normally takes a few seconds — refresh this page in a moment. We will
          also email the report to {order.email}.
        </p>
      </Shell>
    );
  }

  if (order.status === "failed" || !order.report) {
    // The raw provider error stays on the order for /admin; the buyer gets a
    // plain-language version of it.
    const failure = classifyFailure(order.providerError);
    return (
      <Shell title="We couldn't retrieve this report" order={order}>
        <p>
          Your payment went through but no report came back for this VIN. We
          will not substitute sample data for the report you paid for.
        </p>
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {customerFailureMessage(failure)}
        </p>
        <p>
          {refundPromise(
            formatPrice(order.amountCents, order.currency),
            Boolean(order.refundedAt),
          )}
        </p>
      </Shell>
    );
  }

  const report = withCurrentLayout(order.report);
  const hero = await cachedHeroForReport(report, store);
  // Same fetch as the PDF: a cache peek left the first HTML paint (and the
  // RSC payload) without About this model even when NHTSA had campaigns.
  // extrasToken still lets the client retry if this call fails closed.
  let modelExtras = null;
  try {
    modelExtras = await extrasForReport(report, store);
  } catch (error) {
    console.error("[extras] could not load model extras", error);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <SiteHeader cta="another" />

      <main className="flex-1">
        <div className="no-print border-b border-slate-200 bg-white">
          <div className="container-page py-8">
            {isNew && (
              <>
                <GoogleAdsPurchase orderId={order.id} />
                <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  <span className="font-semibold">Payment received.</span> Your
                  report is below and a private link is on its way to{" "}
                  {order.email}.
                </div>
              </>
            )}

            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
                  Your report
                </p>
                <p className="mt-1.5 text-sm text-slate-500">
                  {order.refundedAt ? "Refunded · " : ""}
                  Keep this page&apos;s link private.
                </p>
              </div>
              <ReportActions pdfHref={paidReportPdfPath(token)} />
            </div>
          </div>
        </div>

        <div className="container-page py-10">
          {/* Laid out from the payload stored with the order, so a report bought
              before a layout change still reads the way today's does. */}
          <ReportView
            report={report}
            brief={order.aiBrief}
            briefToken={token}
            heroSrc={hero?.src}
            heroToken={isFalConfigured() ? token : undefined}
            modelExtras={modelExtras}
            extrasToken={token}
          />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
