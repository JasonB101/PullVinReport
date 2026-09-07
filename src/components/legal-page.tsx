import Link from "next/link";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

type Props = {
  title: string;
  intro: string;
  updated: string;
  children: React.ReactNode;
};

export function LegalPage({ title, intro, updated, children }: Props) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <SiteHeader />

      <main className="flex-1">
        <div className="border-b border-slate-200 bg-slate-50">
          <div className="container-prose py-12 sm:py-16">
            <nav className="text-sm text-slate-500">
              <Link href="/" className="hover:text-slate-900">
                Home
              </Link>
              <span className="mx-2 text-slate-300">/</span>
              <span className="text-slate-900">{title}</span>
            </nav>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              {title}
            </h1>
            <p className="mt-3 text-base leading-relaxed text-slate-600">
              {intro}
            </p>
            <p className="mt-4 text-xs font-medium uppercase tracking-wider text-slate-400">
              Last updated {updated}
            </p>
          </div>
        </div>

        <div className="container-prose py-12 sm:py-16">
          <div className="space-y-9">{children}</div>

          <div className="mt-12 flex flex-wrap gap-4 border-t border-slate-200 pt-8 text-sm">
            <Link href="/privacy" className="font-semibold text-brand-600 hover:underline">
              Privacy policy
            </Link>
            <Link href="/terms" className="font-semibold text-brand-600 hover:underline">
              Terms of service
            </Link>
            <Link href="/disclaimer" className="font-semibold text-brand-600 hover:underline">
              Disclaimer
            </Link>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight text-slate-900">
        {heading}
      </h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-slate-600">
        {children}
      </div>
    </section>
  );
}
