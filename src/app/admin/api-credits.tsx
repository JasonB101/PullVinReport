import { formatGeneratedAt } from "@/lib/report";
import {
  BILLING_UNAVAILABLE,
  hasAnyCreditApiConfigured,
  type VendorCreditsReport,
} from "@/lib/vendor-credits";

/**
 * Compact operator card. Numbers come from official vendor APIs only —
 * never rendered as invented zeros. “No credit APIs configured” is only
 * for a literal absence of Stripe / fal / Resend / Anthropic-admin keys.
 */
export function ApiCredits({ report }: { report: VendorCreditsReport }) {
  const noneConfigured = report.items.length === 0 && !hasAnyCreditApiConfigured();

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          API credits
        </h2>
        <p className="text-xs text-slate-400">
          as of {formatGeneratedAt(report.checkedAt)}
        </p>
      </div>

      {noneConfigured ? (
        <p className="mt-3 text-sm text-slate-500">No credit APIs configured</p>
      ) : report.items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{BILLING_UNAVAILABLE}</p>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {report.items.map((item) => (
            <div
              key={item.key}
              className="rounded-xl border border-slate-100 bg-slate-50/80 px-3.5 py-3"
            >
              <p className="text-sm font-semibold text-slate-900">{item.vendor}</p>
              <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {item.metric}
              </p>
              {item.ok ? (
                <p className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
                  {item.value}
                </p>
              ) : (
                <p className="mt-1 text-sm text-slate-500">
                  {item.error ?? "Unavailable"}
                </p>
              )}
              <p className="mt-1 text-[11px] text-slate-400">
                as of {formatGeneratedAt(item.asOf)}
              </p>
              {item.key === "anthropic" && report.anthropicBillingUrl ? (
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                  Remaining credits:{" "}
                  <a
                    href={report.anthropicBillingUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="font-medium text-brand-600 hover:underline"
                  >
                    Console Billing ↗
                  </a>
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {report.vinauditAccountUrl && (
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          VinAudit has no balance API on report keys.{" "}
          <a
            href={report.vinauditAccountUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium text-brand-600 hover:underline"
          >
            Account / refill ↗
          </a>
        </p>
      )}
    </section>
  );
}
