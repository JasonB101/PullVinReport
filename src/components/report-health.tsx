import { ScrollOpenDetails } from "@/components/scroll-open-details";
import type { FactorImpact, ReportHealth } from "@/lib/report-health";

const IMPACT: Record<FactorImpact, string> = {
  helps: "bg-emerald-50 text-emerald-800 ring-emerald-200/80",
  hurts: "bg-amber-50 text-amber-900 ring-amber-200/90",
  neutral: "bg-white text-slate-600 ring-slate-200",
};

const BAR: Record<ReportHealth["label"], string> = {
  Strong: "bg-emerald-500",
  Mixed: "bg-amber-500",
  Caution: "bg-rose-500",
};

const LABEL: Record<ReportHealth["label"], string> = {
  Strong: "text-emerald-800",
  Mixed: "text-amber-900",
  Caution: "text-rose-800",
};

/**
 * The 0–100 meter and its factor list.
 *
 * Lives on What to know so the header stays quiet. The bar is the number;
 * the disclosure is why it moved. Print opens the breakdown.
 */
export function ReportHealthCard({ health }: { health: ReportHealth }) {
  return (
    <div className="rounded-xl border border-white/80 bg-white/80 p-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Report health
          </p>
          <p className={`mt-1 text-sm font-semibold ${LABEL[health.label]}`}>
            {health.label}
          </p>
        </div>
        <p className="text-3xl font-semibold tabular-nums tracking-tight text-slate-900">
          {health.score}
          <span className="ml-0.5 text-sm font-medium text-slate-400">/100</span>
        </p>
      </div>

      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"
        role="meter"
        aria-label="Report health"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={health.score}
        aria-valuetext={`${health.score} out of 100, ${health.label}`}
      >
        <div
          className={`h-full rounded-full ${BAR[health.label]}`}
          style={{ width: `${health.score}%` }}
        />
      </div>

      <p className="mt-2 text-xs leading-relaxed text-slate-400">
        {health.disclaimer}
      </p>

      <ScrollOpenDetails
        className="mt-3 scroll-mt-32"
        summaryClassName="cursor-pointer list-none text-sm [&::-webkit-details-marker]:hidden"
        summary={
          <span className="when-closed font-medium text-brand-600">
            Why this score
          </span>
        }
      >
        <ul className="mt-3 space-y-2.5 border-t border-slate-100 pt-3">
          {health.factors.map((factor) => (
            <li key={factor.key} className="text-sm leading-relaxed text-slate-700">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-900">{factor.label}</span>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${IMPACT[factor.impact]}`}
                >
                  {factor.impact}
                  {factor.delta !== 0 ? ` ${factor.delta}` : ""}
                </span>
              </div>
              <p className="mt-0.5 text-slate-600">{factor.reason}</p>
            </li>
          ))}
        </ul>
      </ScrollOpenDetails>
    </div>
  );
}
