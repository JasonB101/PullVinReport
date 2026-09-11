import { MpgFigures } from "@/components/mpg-figures";
import { ScrollOpenDetails } from "@/components/scroll-open-details";
import type { Field } from "@/lib/report";
import {
  groupSpecFields,
  headerSpecSummary,
  partitionSpecMpg,
  specMpgTeaser,
  specTeaserFacts,
  type SpecMpg,
} from "@/lib/report";
import {
  SPEC_MPG_NOTE,
  SPEC_MPG_TITLE,
  THIS_VIN_CHIP,
  VIN_SPECS_NOTE,
  VIN_SPECS_OPEN,
  VIN_SPECS_TITLE,
} from "@/lib/report-zones";

function FieldValue({ value }: { value: string }) {
  return <span className="whitespace-pre-line break-words">{value}</span>;
}

function Chevron({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function ThisVinChip() {
  return (
    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200">
      {THIS_VIN_CHIP}
    </span>
  );
}

function SpecsFace({
  mpg,
  facts,
  moreCount,
}: {
  mpg: SpecMpg | null;
  facts: Field[];
  moreCount: number;
}) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="block text-base font-semibold tracking-tight text-slate-900">
            {VIN_SPECS_TITLE}
          </span>
          <span className="mt-2 inline-flex">
            <ThisVinChip />
          </span>
        </div>
        <Chevron className="disclosure-chevron mt-1 text-slate-400" />
      </div>

      {mpg && (
        <div className="when-closed mt-4">
          <p className="sr-only">{specMpgTeaser(mpg)}</p>
          <ul
            aria-hidden="true"
            className={`grid gap-2 ${
              mpg.figures.length === 2 ? "grid-cols-2" : "grid-cols-3"
            }`}
          >
            {mpg.figures.map((row) => (
              <li
                key={row.key}
                className="rounded-xl border border-slate-200/90 bg-white px-2 py-2.5 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:px-3"
              >
                <p className="text-2xl font-semibold tabular-nums tracking-tight text-slate-900 sm:text-[1.75rem]">
                  {row.display}
                </p>
                <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {row.label}
                </p>
                <p className="text-[11px] text-slate-400">mpg</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {facts.length > 0 && (
        <ul className="when-closed mt-3 flex flex-wrap gap-2">
          {facts.map((field, index) => (
            <li
              key={`${field.label}-${index}`}
              className="inline-flex max-w-full items-baseline gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs ring-1 ring-inset ring-slate-200"
            >
              <span className="shrink-0 text-slate-400">{field.label}</span>
              <span className="min-w-0 break-words font-medium text-slate-800">
                <FieldValue value={field.value} />
              </span>
            </li>
          ))}
        </ul>
      )}

      <span className="when-closed mt-3 flex min-h-11 items-center gap-1.5 text-sm font-medium text-brand-600">
        {VIN_SPECS_OPEN}
        {moreCount > 0 && (
          <span className="font-normal text-slate-400">
            · {moreCount} {moreCount === 1 ? "detail" : "details"}
          </span>
        )}
        <Chevron />
      </span>
    </>
  );
}

function SpecCard({ field }: { field: Field }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200/90 bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        {field.label}
      </dt>
      <dd className="mt-1.5 break-words text-[15px] font-medium leading-snug tracking-tight text-slate-900">
        <FieldValue value={field.value} />
      </dd>
    </div>
  );
}

/**
 * VIN-build specs on the vehicle card.
 *
 * Closed: a designed teaser — MPG tiles, a few complementary chips, and a
 * Show-specifications control. Open: MPG as the hero band, then grouped
 * cards (powertrain, body, equipment). Print opens it. Same fields the
 * PDF prints; nothing invented.
 */
export function VehicleSpecs({ specifications }: { specifications: Field[] }) {
  if (specifications.length === 0) return null;

  const { mpg, rest } = partitionSpecMpg(specifications);
  const summary = headerSpecSummary(specifications);
  const facts = specTeaserFacts(rest, { exclude: summary, limit: 3 });
  const groups = groupSpecFields(rest);

  return (
    <ScrollOpenDetails
      className="scroll-mt-32 border-t border-slate-200/80 bg-gradient-to-b from-slate-50 to-white px-5 py-5 sm:px-7 sm:py-6"
      summaryClassName="cursor-pointer list-none [&::-webkit-details-marker]:hidden"
      summary={
        <SpecsFace mpg={mpg} facts={facts} moreCount={rest.length} />
      }
    >
      <div className="mt-5 border-t border-slate-200/80 pt-5">
        <p className="max-w-2xl text-xs leading-relaxed text-slate-500">
          {VIN_SPECS_NOTE}
        </p>

        {mpg && (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-[radial-gradient(28rem_14rem_at_0%_0%,rgba(37,99,235,0.06),transparent_62%)] bg-white p-4 sm:p-5">
            <MpgFigures
              headingId="vin-spec-mpg-heading"
              heading={SPEC_MPG_TITLE}
              figures={mpg.figures}
              note={SPEC_MPG_NOTE}
              tone="slate"
              emphasize="none"
            />
          </div>
        )}

        {groups.map((group) => (
          <section key={group.key} className="mt-6">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              {group.title}
            </h3>
            <dl className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {group.fields.map((field, index) => (
                <SpecCard key={`${field.label}-${index}`} field={field} />
              ))}
            </dl>
          </section>
        ))}
      </div>
    </ScrollOpenDetails>
  );
}
