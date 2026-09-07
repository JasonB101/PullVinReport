import Link from "next/link";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <SiteHeader />

      <main className="container-page flex flex-1 items-center py-20">
        <div className="mx-auto max-w-md text-center">
          <p className="font-mono text-sm font-semibold tracking-widest text-brand-600">
            404
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
            We couldn&apos;t find that page
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            If you were opening a report link, it may have been mistyped or
            truncated by your email client. You can look it up again with your
            order reference.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/"
              className="rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-500"
            >
              Go home
            </Link>
            <Link
              href="/lookup"
              className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Find my report
            </Link>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
