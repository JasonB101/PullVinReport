import { AiBrief } from "@/components/ai-brief";
import { ModelExtrasCard } from "@/components/model-extras";
import { ReportHealthCard } from "@/components/report-health";
import { ScrollOpenDetails } from "@/components/scroll-open-details";
import { VehicleHero } from "@/components/vehicle-hero";
import type { VehicleBrief } from "@/lib/ai-brief";
import type { ModelExtras } from "@/lib/model-extras";
import { reportHealth } from "@/lib/report-health";
import { REPORT_DISCLAIMER } from "@/lib/customer-copy";
import type {
  Field,
  Listing,
  ListingGroup,
  ReportCheck,
  ReportChip,
  ReportSection,
  SectionTable,
  VehicleReport,
} from "@/lib/report";
import {
  LEAD_FIELDS,
  formatGeneratedAt,
  foundIssueChecks,
  hasOdometerRollback,
  headerSpecSummary,
  reportChips,
  reportNavItems,
  searchedAndEmpty,
  sectionCountLabel,
  sectionLead,
  sectionListingGroups,
  sectionTable,
  sectionsWithRecords,
  vehicleTitle,
} from "@/lib/report";
import { heroAlt, heroFacts } from "@/lib/vehicle-hero";
import { prettyVin } from "@/lib/vin";

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
    clear: "bg-emerald-50 text-emerald-800 ring-emerald-200/80",
    flag: "bg-amber-50 text-amber-900 ring-amber-200/90",
    neutral: "bg-white text-slate-600 ring-slate-200",
  }[chip.tone];

  return (
    <li>
      <span
        className={`inline-flex rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset ${tone}`}
      >
        {chip.label}
      </span>
    </li>
  );
}

const FINDING_LABEL: Record<string, string> = {
  accidents: "Accidents",
  liens: "Liens",
  recalls: "Recalls",
  thefts: "Thefts",
  jsi: "Junk & salvage",
  branded: "Branded title",
  impounds: "Impounds",
  exports: "Exports",
  sales: "Listings",
};

function findingLabel(check: ReportCheck): string {
  const name = FINDING_LABEL[check.key] ?? check.label;
  return check.count > 0 ? `${name} · ${check.count}` : name;
}

/**
 * Compact found/clear strip inside What to know.
 *
 * Labels only — the brief already writes the story, and repeating each
 * check's detail next to those bullets was the same flag twice.
 */
function FindingsStrip({
  flags,
  clear,
}: {
  flags: ReportCheck[];
  clear: string[];
}) {
  return (
    <div>
      {flags.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {flags.map((check) => (
            <li
              key={check.key}
              className="inline-flex max-w-full rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-200/90"
            >
              {findingLabel(check)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-900">
          None of the issue checks came back with a record for this VIN.
        </p>
      )}

      {clear.length > 0 && (
        <p className="mt-3 text-sm leading-relaxed text-slate-500">
          <span className="font-medium text-slate-600">
            Searched, nothing on file:{" "}
          </span>
          {clear.join(" · ")}
        </p>
      )}

      <p className="mt-2 text-xs leading-relaxed text-slate-400">
        Nothing on file means no matching record was found — not that an event
        never happened.
      </p>
    </div>
  );
}

/** One summary surface: health, findings, and the written brief. */
function WhatToKnow({
  report,
  brief,
  briefToken,
  flags,
  clear,
}: {
  report: VehicleReport;
  brief?: VehicleBrief | null;
  briefToken?: string;
  flags: ReportCheck[];
  clear: string[];
}) {
  return (
    <section
      id="brief"
      className="scroll-mt-32 rounded-2xl border border-brand-200 bg-brand-50/50 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight text-slate-900">
          What to know
        </h2>
        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200">
          From the records below
        </span>
      </div>

      <div className="mt-4">
        <ReportHealthCard health={reportHealth(report)} />
      </div>

      <div className="mt-4">
        <FindingsStrip flags={flags} clear={clear} />
      </div>

      <AiBrief brief={brief} token={briefToken} />
    </section>
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
function Cell({ value, note }: { value: string; note?: string }) {
  if (value === "Yes") {
    return (
      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
        Yes
      </span>
    );
  }
  if (value === "No") return <span className="text-slate-400">No</span>;
  return (
    <>
      {value || "—"}
      {note && <span className="ml-1.5 text-xs font-normal text-slate-400">{note}</span>}
    </>
  );
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
  const mileageIndex = table.columns.indexOf("Mileage");

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
                      : row.mileageUnchanged && cellIndex === mileageIndex
                        ? "text-slate-400"
                        : "text-slate-700"
                  }`}
                >
                  <Cell
                    value={cell}
                    note={
                      cellIndex === mileageIndex && row.mileageUnchanged
                        ? "unchanged"
                        : undefined
                    }
                  />
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

function EpisodeFacts({ group }: { group: ListingGroup }) {
  const facts = [
    group.location && { label: "Location", value: group.location },
    group.mileage && { label: "Mileage", value: group.mileage },
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact));

  if (facts.length === 0) return null;

  return (
    <span className="flex w-full flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-500">
      {facts.map((field, index) => (
        <span key={`${field.label}-${index}`}>
          {index > 0 && <span className="pr-1.5 text-slate-300">·</span>}
          <span className="text-slate-400">{field.label}: </span>
          <span className="text-slate-700">{field.value}</span>
        </span>
      ))}
    </span>
  );
}

/**
 * One listing chapter: a dealer group / region / date window, not a sale.
 *
 * Sister rooftops and aggregator scrapes stay under the chapter. The raw
 * snapshots are one click away so nothing is deleted, just taken off the
 * timeline a buyer scans first.
 */
function ListingGroupCard({ group }: { group: ListingGroup }) {
  const extras =
    group.listings.length === 1 ? group.listings[0].detail : [];

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-4">
        <span className="text-sm font-semibold text-slate-900">
          {group.identity}
        </span>
        {group.date && (
          <span className="text-xs text-slate-500">{group.date}</span>
        )}
        {group.price && (
          <span className="ml-auto text-base font-semibold tabular-nums text-slate-900">
            {group.price}
          </span>
        )}
        <EpisodeFacts group={group} />
      </div>

      {group.listings.length > 1 ? (
        <ScrollOpenDetails
          className="scroll-mt-32 border-t border-slate-100"
          summaryClassName="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm [&::-webkit-details-marker]:hidden"
          summary={
            <span className="when-closed font-medium text-brand-600">
              Show {group.listings.length} listing snapshots
            </span>
          }
        >
          <div className="space-y-3 px-4 pb-4">
            {group.listings.map((listing, index) => (
              <ListingCard
                key={`${listing.headline}-${listing.date}-${index}`}
                listing={listing}
              />
            ))}
          </div>
        </ScrollOpenDetails>
      ) : extras.length > 0 ? (
        <ScrollOpenDetails
          className="scroll-mt-32 border-t border-slate-100"
          summaryClassName="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm [&::-webkit-details-marker]:hidden"
          summary={
            <span className="font-medium text-brand-600">
              <MoreHint count={extras.length} />
            </span>
          }
        >
          <div className="px-4 pb-4">
            <FieldGrid fields={extras} />
          </div>
        </ScrollOpenDetails>
      ) : null}
    </div>
  );
}

function SectionFace({
  section,
  odometerRollback,
}: {
  section: ReportSection;
  odometerRollback: boolean;
}) {
  const lead = sectionLead(section);
  const count = sectionCountLabel(section);

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold tracking-tight text-slate-900">
          {section.title}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {odometerRollback && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
              Possible rollback
            </span>
          )}
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
            {count}
          </span>
        </div>
      </div>
      {lead && (
        <p className="mt-2 text-sm text-slate-700">
          <span className="font-semibold text-slate-900">{lead.label}: </span>
          {lead.text}
        </p>
      )}
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-500">
        {section.description}
      </p>
    </>
  );
}

function SectionRecords({
  section,
  listings,
  table,
}: {
  section: ReportSection;
  listings: ListingGroup[] | null;
  table: SectionTable | null;
}) {
  return (
    <>
      {section.shared && section.shared.length > 0 && (
        <SharedFields fields={section.shared} count={section.records.length} />
      )}

      {listings ? (
        <div className="mt-4 space-y-3">
          {listings.map((group, index) => (
            <ListingGroupCard key={`${group.identity}-${group.date}-${index}`} group={group} />
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
    </>
  );
}

function SectionBlock({
  section,
  odometerRollback = false,
}: {
  section: ReportSection;
  odometerRollback?: boolean;
}) {
  const listings =
    section.layout === "listings" ? sectionListingGroups(section) : null;
  const table = listings ? null : sectionTable(section);
  const count = sectionCountLabel(section);

  return (
    <section
      id={section.key}
      className="scroll-mt-32 rounded-2xl border border-slate-200 bg-slate-50/60 p-5 sm:p-6"
    >
      {listings && listings.length > 0 ? (
        <>
          <SectionFace section={section} odometerRollback={odometerRollback} />
          <SectionRecords section={section} listings={listings} table={null} />
        </>
      ) : (
        <ScrollOpenDetails
          className="scroll-mt-32"
          summaryClassName="cursor-pointer list-none [&::-webkit-details-marker]:hidden"
          summary={
            <>
              <SectionFace section={section} odometerRollback={odometerRollback} />
              <span className="when-closed mt-3 flex text-sm font-medium text-brand-600">
                Show {count}
              </span>
            </>
          }
        >
          <div className="border-t border-slate-200/80 pt-1">
            <SectionRecords section={section} listings={null} table={table} />
          </div>
        </ScrollOpenDetails>
      )}
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
    <ScrollOpenDetails
      className="scroll-mt-32 border-t border-slate-200 bg-white px-5 py-4 sm:px-7"
      summaryClassName="flex cursor-pointer list-none items-center justify-between gap-3 text-sm [&::-webkit-details-marker]:hidden"
      summary={
        <>
          <span className="font-semibold text-slate-900">
            Vehicle specifications
          </span>
          <MoreHint count={specifications.length} />
        </>
      }
    >
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
    </ScrollOpenDetails>
  );
}

/** Outline of the report. Only parts that came back with something are listed. */
function JumpNav({ report }: { report: VehicleReport }) {
  const items = reportNavItems(report);
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
  heroSrc = null,
  heroToken,
  modelExtras = null,
  extrasToken,
}: {
  report: VehicleReport;
  /** A brief already written for this report, if there is one. */
  brief?: VehicleBrief | null;
  /** Access token, given only when a missing brief may be requested. */
  briefToken?: string;
  /** Cached illustration for this year/make/model/trim/color. */
  heroSrc?: string | null;
  /** Access token, given only when a missing hero may be requested. */
  heroToken?: string;
  /** Public YMM extras already in hand (sample fixture or a cache hit). */
  modelExtras?: ModelExtras | null;
  /** Access token, given only when missing extras may be requested. */
  extrasToken?: string;
}) {
  const chips = reportChips(report);
  const specs = headerSpecSummary(report.specifications);
  const facts = heroFacts(report);
  const illustrationAlt = facts
    ? heroAlt(facts)
    : "Illustrated vehicle";
  const flags = foundIssueChecks(report);
  const clear = searchedAndEmpty(report);
  const sections = sectionsWithRecords(report);

  return (
    <article
      className={`space-y-5 ${report.isSample ? "sample-hatch rounded-3xl p-1 sm:p-2" : ""}`}
    >
      {report.isSample && <SampleBanner />}

      <header className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
        <div className="bg-[radial-gradient(36rem_22rem_at_100%_0%,rgba(37,99,235,0.07),transparent_58%),radial-gradient(28rem_18rem_at_0%_110%,rgba(14,165,233,0.05),transparent_52%)] bg-slate-50 px-5 py-6 sm:px-7 sm:py-7">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:gap-10">
            <div className="min-w-0 flex-1">
              {/* The vehicle and its VIN are stated here and nowhere else. */}
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                {vehicleTitle(report.vehicle)}
              </h1>
              <p className="mt-2 font-mono text-sm tracking-wider text-slate-500">
                {prettyVin(report.vin)}
              </p>
              {specs.length > 0 && (
                <p className="mt-2 text-sm text-slate-500">
                  {specs.map((spec) => spec.value).join(" · ")}
                </p>
              )}

              {chips.length > 0 && (
                <ul className="mt-5 flex flex-wrap gap-2.5">
                  {chips.map((chip) => (
                    <Chip key={chip.key} chip={chip} />
                  ))}
                </ul>
              )}

              <p className="mt-5 text-xs text-slate-400">
                Generated {formatGeneratedAt(report.generatedAt)}
              </p>
            </div>

            <VehicleHero
              src={heroSrc}
              token={heroToken}
              sample={report.isSample}
              alt={illustrationAlt}
            />
          </div>
        </div>

        <div className="border-t border-slate-200 bg-white px-5 py-5 sm:px-7">
          <p className="text-sm leading-relaxed text-slate-700">
            <span className="font-semibold text-slate-900">Summary. </span>
            {report.headline}
          </p>
        </div>

        <HeaderSpecs specifications={report.specifications} />
      </header>

      <JumpNav report={report} />

      <WhatToKnow
        report={report}
        brief={brief}
        briefToken={briefToken}
        flags={flags}
        clear={clear}
      />

      <ModelExtrasCard extras={modelExtras} token={extrasToken} />

      {sections.map((section) => (
        <SectionBlock
          key={section.key}
          section={section}
          odometerRollback={
            section.key === "titles" && hasOdometerRollback(report.odometer)
          }
        />
      ))}

      <p className="px-1 text-xs leading-relaxed text-slate-500">
        {report.isSample
          ? "Sample report. All data shown is fictional and provided for illustration only."
          : REPORT_DISCLAIMER}
      </p>
    </article>
  );
}
