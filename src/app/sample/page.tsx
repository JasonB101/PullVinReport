import type { Metadata } from "next";
import Link from "next/link";

import { DownloadPdfButton } from "@/components/download-pdf-button";
import { ReportView } from "@/components/report-view";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { VinForm } from "@/components/vin-form";
import { formatPrice } from "@/lib/config";
import { SAMPLE_REPORT_PDF_PATH } from "@/lib/report-pdf-serve";
import {
  buildSampleBrief,
  buildSampleModelExtras,
  buildSampleReport,
  SAMPLE_VEHICLE_LABEL,
} from "@/lib/sample-report";

export const metadata: Metadata = {
  title: "Sample vehicle history report",
  description:
    "A complete, clearly labelled sample of the vehicle history report you receive — so you know exactly what you are buying before you pay.",
};

export default function SamplePage() {
  const report = buildSampleReport();

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <SiteHeader />

      <main className="flex-1">
        <div className="border-b border-slate-200 bg-white">
          <div className="container-page py-10 sm:py-14">
            <nav className="text-sm text-slate-500">
              <Link href="/" className="hover:text-slate-900">
                Home
              </Link>
              <span className="mx-2 text-slate-300">/</span>
              <span className="text-slate-900">Sample report</span>
            </nav>

            <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
              <p className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                Sample report — {SAMPLE_VEHICLE_LABEL}
              </p>
              <DownloadPdfButton href={SAMPLE_REPORT_PDF_PATH} />
            </div>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
              This is the exact layout of a purchased report, filled with
              fictional data. Nothing here describes a real vehicle. When you
              buy, every field is replaced with live records pulled for the VIN
              you enter.
            </p>

            <div className="mt-8 max-w-2xl">
              <VinForm submitLabel={`Get my report · ${formatPrice()}`} />
            </div>
          </div>
        </div>

        <div className="container-page py-10 sm:py-14">
          {/* The sample's brief and model extras are fixtures, so browsing
              `/sample` never spends a token or hits NHTSA/EPA. */}
          <ReportView
            report={report}
            brief={buildSampleBrief()}
            modelExtras={buildSampleModelExtras()}
          />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
