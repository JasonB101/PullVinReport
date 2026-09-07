import type { Metadata } from "next";

import { LookupForm } from "@/app/lookup/lookup-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { emailConfig } from "@/lib/config";

export const metadata: Metadata = {
  title: "Find my report",
  description: "Lost the link to a report you bought? Re-open it here.",
  robots: { index: false, follow: true },
};

export default function LookupPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <SiteHeader />

      <main className="container-page flex-1 py-14 sm:py-20">
        <div className="mx-auto max-w-md">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Find my report
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Lost the emailed link? Enter your order reference and the email you
            used at checkout and we&apos;ll take you straight back to your
            report.
          </p>

          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
            <LookupForm />
          </div>

          <p className="mt-6 text-sm text-slate-500">
            Can&apos;t find your order reference? Email{" "}
            <a
              className="font-semibold text-brand-600 hover:underline"
              href={`mailto:${emailConfig.supportEmail}`}
            >
              {emailConfig.supportEmail}
            </a>{" "}
            from the address you paid with and we&apos;ll send the link again.
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
