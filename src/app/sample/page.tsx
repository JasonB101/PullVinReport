import type { Metadata } from "next";
import Link from "next/link";

import { ReportView } from "@/components/report-view";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { VinForm } from "@/components/vin-form";
import { formatPrice } from "@/lib/config";
import { buildSampleReport, SAMPLE_VEHICLE_LABEL } from "@/lib/sample-report";

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

            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Sample report — {SAMPLE_VEHICLE_LABEL}
            </h1>
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
          <ReportView report={report} />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
