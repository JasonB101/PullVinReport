import Link from "next/link";

import { buildSampleReport, SAMPLE_VEHICLE_LABEL } from "@/lib/sample-report";
import { prettyVin } from "@/lib/vin";

/**
 * Compact, obviously-labelled preview of the sample report used on marketing
 * pages. Always renders the SAMPLE chip — there is no unlabelled variant.
 */
export function SampleTeaser() {
  const report = buildSampleReport();

  return (
    <div className="sample-hatch overflow-hidden rounded-3xl border border-amber-200 bg-white p-2 shadow-card">
      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white">
                Sample
              </span>
              <span className="truncate text-sm font-semibold text-slate-900">
                {SAMPLE_VEHICLE_LABEL}
              </span>
            </div>
            <p className="mt-1 truncate font-mono text-xs tracking-wider text-slate-400">
              {prettyVin(report.vin)}
            </p>
          </div>
          <Link
            href="/sample"
            className="shrink-0 text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            Open full sample →
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-2.5 p-4 sm:grid-cols-4">
          {report.checks.slice(0, 8).map((check) => (
            <div
              key={check.key}
              className={`rounded-xl border p-3 ${
                check.status === "found"
                  ? "border-amber-200 bg-amber-50/70"
                  : "border-emerald-200 bg-emerald-50/60"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[11px] font-semibold text-slate-700">
                  {check.label}
                </span>
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    check.status === "found" ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                />
              </div>
              <p className="mt-1 text-[11px] leading-snug text-slate-500">
                {check.status === "found" ? `${check.count} found` : "None found"}
              </p>
            </div>
          ))}
        </div>

        <p className="border-t border-slate-100 px-5 py-3 text-[11px] leading-relaxed text-amber-800">
          Fictional data shown for illustration. Your purchased report contains
          live records for the VIN you enter.
        </p>
      </div>
    </div>
  );
}
