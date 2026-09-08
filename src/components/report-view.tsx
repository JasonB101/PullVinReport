import { AiBrief } from "@/components/ai-brief";
import type { VehicleBrief } from "@/lib/ai-brief";
import { REPORT_DISCLAIMER } from "@/lib/customer-copy";
import type {
  Field,
  Listing,
  ReportCheck,
  ReportChip,
  ReportSection,
  SectionTable,
  VehicleReport,
} from "@/lib/report";
import {
  LEAD_FIELDS,
  currentEvent,
  formatEventDate,
  hasOdometerRollback,
  reportChips,
  reportNavItems,
  searchedAndEmpty,
  sectionListings,
  sectionTable,
  sectionsWithRecords,
  vehicleTitle,
} from "@/lib/report";
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
        live records pulled for the exact VIN you enter.
      </p>
    </div>
  );
}

/** Header chips. Each one restates a record we hold — never a score or a price. */
function Chip({ chip }: { chip: ReportChip }) {
  const tone = {
    clear: "bg-emerald-400/15 text-emerald-200 ring-emerald-400/30",
    flag: "bg-amber-400/20 text-amber-100 ring-amber-300/40",
    neutral: "bg-white/10 text-slate-200 ring-white/15",
  }[chip.tone];

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${tone}`}
    >
      {chip.label}
    </span>
  );
}

/** Only checks that actually fired get a tile; the rest are one line of text. */
function FlagTile({ check }: { check: ReportCheck }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-amber-900">{check.label}</span>
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" />
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-amber-900/80">
        {check.detail}
      </p>
    </div>
  );
}

function FieldGrid({ fields }: { fields: Field[] }) {
  return (
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
  );
}

/** The link that says how much is folded away. Absent once the card is open. */
function MoreHint({ count }: { count: number }) {
  return (
    <span className="when-closed font-medium text-brand-600">
      {count} more {count === 1 ? "detail" : "details"}
    </span>
  );
}

/**
 * A record with no shared shape to tabulate — a recall campaign, a lien whose
 * feed answered in fields nothing else uses.
 *
 * Compact by default. Every field at once is the dump that made these sections
 * unreadable; the first few are what a reader scans, and the rest are a
 * keystroke away rather than gone.
 */
function RecordCard({ fields }: { fields: Field[] }) {
  const summary = fields.slice(0, LEAD_FIELDS);
  const detail = fields.slice(LEAD_FIELDS);

  if (detail.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <FieldGrid fields={summary} />
      </div>
    );
  }

  return (
    <details className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <summary className="cursor-pointer list-none p-4 [&::-webkit-details-marker]:hidden">
        <FieldGrid fields={summary} />
        <span className="mt-3 flex text-xs">
          <MoreHint count={detail.length} />
        </span>
      </summary>
      <div className="border-t border-slate-100 px-4 py-4">
        <FieldGrid fields={detail} />
      </div>
    </details>
  );
}

/**
 * A Yes is worth a badge — it is the answer the reader is scanning for. A No is
 * the default on nearly every row, so it stays quiet text instead of adding a
 * column of identical chips.
 */
function Cell({ value }: { value: string }) {
  if (value === "Yes") {
    return (
      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
        Yes
      </span>
    );
  }
  if (value === "No") return <span className="text-slate-400">No</span>;
  return <>{value || "—"}</>;
}

/** Fields the provider repeated on every record, stated once for the section. */
function SharedFields({ fields, count }: { fields: Field[]; count: number }) {
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-500">
      <span className="rounded-full bg-white px-2 py-0.5 font-medium text-slate-500 ring-1 ring-slate-200">
        Same on all {count} records
      </span>
      {fields.map((field, index) => (
        <span key={`${field.label}-${index}`}>
          {index > 0 && <span className="pr-1.5 text-slate-300">·</span>}
          <span className="text-slate-400">{field.label}: </span>
          <span className="text-slate-600">{field.value}</span>
        </span>
      ))}
    </p>
  );
}

function RecordTable({ table }: { table: SectionTable }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="bg-slate-50">
            {table.columns.map((column) => (
              <th
                key={column}
                scope="col"
                className="whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        {table.rows.map((row, index) => (
          <tbody key={index} className="border-t border-slate-200">
            <tr>
              {row.cells.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={`px-4 pt-3 align-top ${
                    row.extras.length > 0 ? "pb-1" : "pb-3"
                  } ${
                    cellIndex === 0
                      ? "whitespace-nowrap font-medium text-slate-900"
                      : "text-slate-700"
                  }`}
                >
                  <Cell value={cell} />
                </td>
              ))}
            </tr>
            {row.extras.length > 0 && (
              <tr>
                <td colSpan={table.columns.length} className="px-4 pb-3">
                  {/* A title number and a claim code under every row is the
                      noise that buried the date and the mileage above them.
                      They stay in the report, one keystroke down. */}
                  <details>
                    <summary className="cursor-pointer list-none text-xs [&::-webkit-details-marker]:hidden">
                      <MoreHint count={row.extras.length} />
                    </summary>
                    <dl className="mt-2 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
                      {row.extras.map((field, extraIndex) => (
                        <div key={`${field.label}-${extraIndex}`} className="min-w-0">
                          <dt className="inline text-slate-400">{field.label}: </dt>
                          <dd className="inline break-words text-slate-600">
                            {field.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                </td>
              </tr>
            )}
          </tbody>
        ))}
      </table>
    </div>
  );
}

/**
 * One listing, with its long tail folded away.
 *
 * A sales feed sends a dealer, a stock number, two colours, a lot number and a
 * paragraph of ad copy behind the four facts a buyer is actually comparing
 * between listings. Shown all at once it buries the price. Nothing is dropped —
 * `<details>` keeps it a keystroke away, works with no JavaScript, and the
 * print stylesheet opens every card so a printed copy is still complete.
 */
function ListingCard({ listing }: { listing: Listing }) {
  return (
    <details className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] open:shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
      <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-1 p-4 [&::-webkit-details-marker]:hidden">
        <span className="text-sm font-semibold text-slate-900">
          {listing.headline}
        </span>
        {listing.date && (
          <span className="text-xs text-slate-500">{listing.date}</span>
        )}
        {listing.price && (
          <span className="ml-auto text-base font-semibold tabular-nums text-slate-900">
            {listing.price}
          </span>
        )}

        <span className="flex w-full flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-500">
          {listing.summary.map((field, index) => (
            <span key={`${field.label}-${index}`}>
              {index > 0 && <span className="pr-1.5 text-slate-300">·</span>}
              <span className="text-slate-400">{field.label}: </span>
              <span className="text-slate-700">{field.value}</span>
            </span>
          ))}
          {listing.detail.length > 0 && (
            <span className="ml-auto">
              <MoreHint count={listing.detail.length} />
            </span>
          )}
        </span>
      </summary>

      {listing.detail.length > 0 && (
        <div className="border-t border-slate-100 px-4 py-4">
          <FieldGrid fields={listing.detail} />
        </div>
      )}
    </details>
  );
}

function SectionBlock({ section }: { section: ReportSection }) {
  const listings = section.layout === "listings" ? sectionListings(section) : null;
  const table = listings ? null : sectionTable(section);
  const current = currentEvent(section);

  return (
    <section
      id={section.key}
      className="scroll-mt-32 rounded-2xl border border-slate-200 bg-slate-50/60 p-5 sm:p-6"
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

      {current && (
        <p className="mt-3 text-sm text-slate-700">
          <span className="font-semibold text-slate-900">{current.label}: </span>
          {current.fields.map((field) => field.value).join(" · ")}
        </p>
      )}

      {section.shared && section.shared.length > 0 && (
        <SharedFields fields={section.shared} count={section.records.length} />
      )}

      {listings ? (
        <div className="mt-4 space-y-3">
          {listings.map((listing, index) => (
            <ListingCard key={index} listing={listing} />
          ))}
        </div>
      ) : table ? (
        <RecordTable table={table} />
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

/**
 * Mileage as reported, one line per dated event.
 *
 * No bar chart: three registrations at the same mileage drew three identical
 * bars, which made a real history look like a copy-paste. A repeat is marked as
 * unchanged instead, and the reading itself is what the eye lands on.
 */
function Odometer({ report }: { report: VehicleReport }) {
  if (report.odometer.length === 0) return null;
  const rollback = hasOdometerRollback(report.odometer);
  const newestFirst = [...report.odometer].reverse();

  return (
    <section
      id="odometer"
      className="scroll-mt-32 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
    >
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
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-500">
        Mileage as reported at each title event, newest first.
      </p>

      <ul className="mt-4 divide-y divide-slate-100">
        {newestFirst.map((reading, index) => {
          const older = newestFirst[index + 1];
          const unchanged = older?.value === reading.value;
          return (
            <li
              key={`${reading.date}-${index}`}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5"
            >
              <span className="w-28 shrink-0 text-xs text-slate-500">
                {formatEventDate(reading.date)}
              </span>
              <span
                className={`text-base font-semibold tabular-nums ${
                  unchanged ? "text-slate-400" : "text-slate-900"
                }`}
              >
                {reading.value.toLocaleString("en-US")}
                <span className="ml-1 text-xs font-normal text-slate-400">
                  {reading.unit}
                </span>
              </span>
              {unchanged && (
                <span className="text-xs text-slate-400">unchanged</span>
              )}
              <span className="ml-auto text-xs text-slate-500">
                {reading.source}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Specs on the vehicle card, closed until asked for.
 *
 * The card already states the year, make, model and the status chips. The
 * engine, drivetrain, fuel and trim sit behind this disclosure so they stop
 * being a second section at the bottom of the report. Print opens it.
 */
function HeaderSpecs({ specifications }: { specifications: Field[] }) {
  if (specifications.length === 0) return null;

  return (
    <details className="border-t border-slate-200 bg-white px-5 py-4 sm:px-7">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm [&::-webkit-details-marker]:hidden">
        <span className="font-semibold text-slate-900">
          Vehicle specifications
        </span>
        <MoreHint count={specifications.length} />
      </summary>
      <p className="mt-3 text-xs text-slate-500">
        Decoded from the VIN and the manufacturer&apos;s build record.
      </p>
      <dl className="mt-3 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {specifications.map((spec, index) => (
          <div key={`${spec.label}-${index}`} className="border-t border-slate-100 pt-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {spec.label}
            </dt>
            <dd className="mt-0.5 text-sm text-slate-800">{spec.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** Outline of the report. Only parts that came back with something are listed. */
function JumpNav({
  report,
  hasBrief,
}: {
  report: VehicleReport;
  hasBrief: boolean;
}) {
  const items = reportNavItems(report, { hasBrief });
  if (items.length < 2) return null;

  return (
    <nav
      aria-label="Report sections"
      className="no-print sticky top-16 z-30 rounded-2xl border border-slate-200 bg-white/90 px-2 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur"
    >
      <ul className="flex items-center gap-1 overflow-x-auto whitespace-nowrap">
        {items.map((item) => (
          <li key={item.href}>
            <a
              href={item.href}
              className="inline-flex rounded-full px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/* -------------------------------------------------------------------------- */

export function ReportView({
  report,
  brief = null,
  briefToken,
}: {
  report: VehicleReport;
  /** A brief already written for this report, if there is one. */
  brief?: VehicleBrief | null;
  /** Access token, given only when a missing brief may be requested. */
  briefToken?: string;
}) {
  const chips = reportChips(report);
  const flags = report.checks.filter((check) => check.status === "found");
  const clear = searchedAndEmpty(report);
  const sections = sectionsWithRecords(report);

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
                Live records
              </span>
            )}
          </div>

          {/* The vehicle and its VIN are stated here and nowhere else. */}
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {vehicleTitle(report.vehicle)}
          </h1>
          <p className="mt-2 font-mono text-sm tracking-wider text-brand-200">
            {prettyVin(report.vin)}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <Chip key={chip.key} chip={chip} />
            ))}
          </div>

          <p className="mt-5 border-t border-white/10 pt-4 text-xs text-slate-400">
            Generated {formatDateTime(report.generatedAt)} UTC
          </p>
        </div>

        <div className="border-t border-slate-200 bg-white px-5 py-5 sm:px-7">
          <p className="text-sm leading-relaxed text-slate-700">
            <span className="font-semibold text-slate-900">Summary. </span>
            {report.headline}
          </p>
        </div>

        <HeaderSpecs specifications={report.specifications} />
      </header>

      <JumpNav report={report} hasBrief={Boolean(brief || briefToken)} />

      <AiBrief brief={brief} token={briefToken} />

      <section
        id="summary"
        className="scroll-mt-32 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
      >
        <h2 className="text-base font-semibold tracking-tight text-slate-900">
          What we found
        </h2>

        {flags.length > 0 ? (
          <>
            <p className="mt-1.5 text-sm text-slate-500">
              {flags.length === 1
                ? "One of the checks we run came back with records."
                : `${flags.length} of the checks we run came back with records.`}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {flags.map((check) => (
                <FlagTile key={check.key} check={check} />
              ))}
            </div>
          </>
        ) : (
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-900">
            None of the checks we run came back with a record for this VIN.
          </p>
        )}

        {clear.length > 0 && (
          <p className="mt-4 text-sm leading-relaxed text-slate-500">
            <span className="font-medium text-slate-600">
              Searched, nothing on file:{" "}
            </span>
            {clear.join(" · ")}
          </p>
        )}

        <p className="mt-3 text-xs leading-relaxed text-slate-400">
          Nothing on file means no matching record was found — not that an event
          never happened.
        </p>
      </section>

      <Odometer report={report} />

      {sections.map((section) => (
        <SectionBlock key={section.key} section={section} />
      ))}

      <p className="px-1 text-xs leading-relaxed text-slate-500">
        {report.isSample
          ? "Sample report. All data shown is fictional and provided for illustration only."
          : REPORT_DISCLAIMER}
      </p>
    </article>
  );
}
