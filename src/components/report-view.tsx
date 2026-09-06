import type { Field, ReportCheck, ReportSection, VehicleReport } from "@/lib/report";
import { vehicleTitle } from "@/lib/report";
import { prettyVin } from "@/lib/vin";

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

/* -------------------------------------------------------------------------- */

function SampleBanner() {
  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-md bg-amber-500 px-2.5 py-1 text-xs font-bold uppercase tracking-[0.18em] text-white">
          Sample
        </span>
        <h2 className="text-base font-semibold text-amber-900">
          This is an example report, not a real vehicle
        </h2>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-amber-900/80">
        Every value below is fictional and shown only so you can see the layout
        and depth of a real report before you buy. A purchased report contains
        live records pulled from the VinAudit Vehicle History API for the exact
        VIN you enter.
      </p>
    </div>
  );
}

function CheckTile({ check }: { check: ReportCheck }) {
  const styles = {
    clear: {
      wrap: "border-emerald-200 bg-emerald-50/60",
      dot: "bg-emerald-500",
      label: "text-emerald-900",
      detail: "text-emerald-800/80",
    },
    found: {
      wrap: "border-amber-200 bg-amber-50/70",
      dot: "bg-amber-500",
      label: "text-amber-900",
      detail: "text-amber-900/80",
    },
    unavailable: {
      wrap: "border-slate-200 bg-slate-50",
      dot: "bg-slate-400",
      label: "text-slate-700",
      detail: "text-slate-500",
    },
  }[check.status];

  return (
    <div className={`rounded-xl border p-4 ${styles.wrap}`}>
      <div className="flex items-center justify-between gap-3">
        <span className={`text-sm font-semibold ${styles.label}`}>
          {check.label}
        </span>
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${styles.dot}`} />
      </div>
      <p className={`mt-1.5 text-xs leading-relaxed ${styles.detail}`}>
        {check.detail}
      </p>
    </div>
  );
}

function RecordCard({ fields }: { fields: Field[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {fields.map((field, index) => (
          <div key={`${field.label}-${index}`} className="min-w-0">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {field.label}
            </dt>
            <dd className="mt-0.5 break-words text-sm text-slate-800">
              {field.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SectionBlock({ section }: { section: ReportSection }) {
  return (
    <section
      id={section.key}
      className="scroll-mt-24 rounded-2xl border border-slate-200 bg-slate-50/60 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold tracking-tight text-slate-900">
          {section.title}
        </h3>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
          {section.records.length} record
          {section.records.length === 1 ? "" : "s"}
        </span>
      </div>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-500">
        {section.description}
      </p>

      {section.records.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-5 text-sm text-slate-500">
          {section.emptyLabel}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {section.records.map((fields, index) => (
            <RecordCard key={index} fields={fields} />
          ))}
        </div>
      )}
    </section>
  );
}

function OdometerTimeline({ report }: { report: VehicleReport }) {
  if (report.odometer.length === 0) return null;
  const max = Math.max(...report.odometer.map((reading) => reading.value));
  const rollback = report.odometer.some(
    (reading, index) => index > 0 && reading.value < report.odometer[index - 1].value,
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold tracking-tight text-slate-900">
          Odometer readings
        </h3>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            rollback
              ? "bg-amber-100 text-amber-800"
              : "bg-emerald-100 text-emerald-800"
          }`}
        >
          {rollback ? "Possible rollback" : "Consistent progression"}
        </span>
      </div>
      <ul className="mt-5 space-y-3">
        {report.odometer.map((reading, index) => (
          <li key={`${reading.date}-${index}`} className="grid grid-cols-[6.5rem_1fr] items-center gap-3 sm:grid-cols-[8rem_1fr_7rem]">
            <span className="font-mono text-xs text-slate-500">{reading.date}</span>
            <span className="h-2 rounded-full bg-slate-100">
              <span
                className="block h-2 rounded-full bg-gradient-to-r from-brand-400 to-brand-600"
                style={{ width: `${Math.max(4, (reading.value / max) * 100)}%` }}
              />
            </span>
            <span className="col-span-2 text-xs text-slate-700 sm:col-span-1 sm:text-right">
              <span className="font-semibold">
                {reading.value.toLocaleString("en-US")} {reading.unit}
              </span>
              <span className="ml-1.5 text-slate-400">{reading.source}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SpecGrid({ specifications }: { specifications: Field[] }) {
  if (specifications.length === 0) return null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <h3 className="text-base font-semibold tracking-tight text-slate-900">
        Vehicle specifications
      </h3>
      <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {specifications.map((spec, index) => (
          <div key={`${spec.label}-${index}`} className="border-t border-slate-100 pt-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {spec.label}
            </dt>
            <dd className="mt-0.5 text-sm text-slate-800">{spec.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

export function ReportView({ report }: { report: VehicleReport }) {
  const flagged = report.checks.filter((check) => check.status === "found").length;

  return (
    <article
      className={`space-y-5 ${report.isSample ? "sample-hatch rounded-3xl p-1 sm:p-2" : ""}`}
    >
      {report.isSample && <SampleBanner />}

      <header className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
        <div className="hero-aurora bg-ink-950 px-5 py-7 sm:px-7 sm:py-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-200 ring-1 ring-inset ring-white/15">
              Vehicle history report
            </span>
            {report.isSample ? (
              <span className="rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-950">
                Sample data
              </span>
            ) : (
              <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-300 ring-1 ring-inset ring-emerald-400/30">
                Live provider data
              </span>
            )}
          </div>

          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {vehicleTitle(report.vehicle)}
          </h1>
          <p className="mt-2 font-mono text-sm tracking-wider text-brand-200">
            {prettyVin(report.vin)}
          </p>

          <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-white/10 pt-5 sm:grid-cols-4">
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-slate-400">
                Records flagged
              </dt>
              <dd className="mt-1 text-lg font-semibold text-white">
                {flagged} of {report.checks.length}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-slate-400">
                Data source
              </dt>
              <dd className="mt-1 text-lg font-semibold text-white">
                {report.isSample ? "Sample" : "VinAudit"}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[11px] uppercase tracking-wider text-slate-400">
                Generated
              </dt>
              <dd className="mt-1 text-lg font-semibold text-white">
                {formatDateTime(report.generatedAt)} UTC
              </dd>
            </div>
          </dl>
        </div>

        <div className="border-t border-slate-200 bg-white px-5 py-5 sm:px-7">
          <p className="text-sm leading-relaxed text-slate-700">
            <span className="font-semibold text-slate-900">Summary. </span>
            {report.headline}
          </p>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="text-base font-semibold tracking-tight text-slate-900">
          At a glance
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Each check reflects what the provider returned for this VIN. A green
          check means no matching record was found — not that an event never
          happened.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {report.checks.map((check) => (
            <CheckTile key={check.key} check={check} />
          ))}
        </div>
      </section>

      <OdometerTimeline report={report} />

      {report.sections.map((section) => (
        <SectionBlock key={section.key} section={section} />
      ))}

      <SpecGrid specifications={report.specifications} />

      {report.providerReportUrl && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h3 className="text-base font-semibold tracking-tight text-slate-900">
            Provider copy
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            VinAudit also hosts a copy of this report.
          </p>
          <a
            href={report.providerReportUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            Open the VinAudit copy
            <span aria-hidden="true">→</span>
          </a>
        </section>
      )}

      <p className="px-1 text-xs leading-relaxed text-slate-500">
        {report.isSample
          ? "Sample report. All data shown is fictional and provided for illustration only."
          : "This report is compiled from third-party records supplied by VinAudit. Records are only as complete as what reporting agencies, insurers and states have submitted. It is provided for informational purposes only and is not a guarantee about the vehicle, nor a substitute for an independent inspection."}
      </p>
    </article>
  );
}
