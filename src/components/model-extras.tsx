"use client";

import { useEffect, useState } from "react";

import { ScrollOpenDetails } from "@/components/scroll-open-details";
import { cleanCustomerLine, cleanModelExtras } from "@/lib/customer-text";
import type { ModelComplaints, ModelExtras, ModelMpg } from "@/lib/model-extras";
import {
  complaintSamples,
  hasModelExtras,
  mpgFigureRows,
  requestPaidModelExtras,
} from "@/lib/model-extras";
import {
  EPA_MPG_NOTE,
  EPA_MPG_TITLE,
  MODEL_ZONE_NOTE,
  MODEL_ZONE_TITLE,
  NOT_THIS_VIN_CHIP,
} from "@/lib/report-zones";

type Props = {
  /** Already-summarised extras, from a cache hit or the sample fixture. */
  extras?: ModelExtras | null;
  /** Access token, given only when a missing card may be requested. */
  token?: string;
};

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
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

function OwnerComplaints({
  ymm,
  complaints,
}: {
  ymm: string;
  complaints: ModelComplaints;
}) {
  const samples = complaintSamples(complaints);
  const themes = complaints.themes ?? [];

  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        Owner complaints
      </dt>
      <dd className="mt-0.5">
        {themes.length > 0 || samples.length > 0 ? (
          <ScrollOpenDetails
            className="scroll-mt-32"
            summaryClassName="cursor-pointer list-none [&::-webkit-details-marker]:hidden"
            summary={
              <>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-slate-800">
                    {formatCount(complaints.total)} owner{" "}
                    {complaints.total === 1 ? "complaint" : "complaints"} filed
                    for the {ymm}
                    <span className="text-slate-500"> — not this VIN</span>
                  </p>
                  <Chevron className="disclosure-chevron mt-0.5 text-slate-400" />
                </div>
                {themes.length > 0 && (
                  <p className="when-closed mt-1.5 text-sm text-slate-600">
                    Most-named:{" "}
                    {themes
                      .slice(0, 2)
                      .map((theme) => theme.component)
                      .join(", ")}
                    {themes.length > 2 ? "…" : ""}
                  </p>
                )}
                <span className="when-closed mt-2 flex items-center gap-1 text-sm font-medium text-brand-600">
                  Show {samples.length > 0 ? samples.length : themes.length}{" "}
                  {samples.length > 0
                    ? samples.length === 1
                      ? "complaint"
                      : "complaints"
                    : themes.length === 1
                      ? "theme"
                      : "themes"}
                  <Chevron />
                </span>
              </>
            }
          >
            {themes.length > 0 && (
              <ul className="mt-3 space-y-2 border-t border-amber-200/70 pt-3">
                {themes.map((theme) => (
                  <li
                    key={theme.component}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <span className="text-slate-800">{theme.component}</span>
                    <span className="shrink-0 tabular-nums text-slate-500">
                      {formatCount(theme.count)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {samples.length > 0 && (
              <div className="mt-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Owner write-ups
                </p>
                <p className="text-xs text-slate-500">
                  Showing {formatCount(samples.length)} of{" "}
                  {formatCount(complaints.total)} for this model year — not this
                  VIN.
                </p>
                <ul className="space-y-3">
                  {samples.map((sample, index) => (
                    <li
                      key={sample.odiNumber ?? `${sample.summary}-${index}`}
                      className="rounded-xl border border-amber-200/80 bg-white/70 px-3 py-3 sm:px-4"
                    >
                      <p className="text-xs text-slate-500">
                        {[sample.date, sample.components]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {(sample.crash || sample.fire) && (
                        <p className="mt-1 text-xs font-medium text-amber-800">
                          {[
                            sample.crash ? "Crash reported" : null,
                            sample.fire ? "Fire reported" : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                      <p className="mt-1.5 text-sm leading-relaxed break-words text-slate-700">
                        {cleanCustomerLine(sample.summary)}
                      </p>
                      {sample.odiNumber && (
                        <p className="mt-1.5 font-mono text-[11px] text-slate-400">
                          NHTSA ODI {sample.odiNumber}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </ScrollOpenDetails>
        ) : (
          <p className="text-sm text-slate-800">
            {formatCount(complaints.total)} owner{" "}
            {complaints.total === 1 ? "complaint" : "complaints"} filed for the{" "}
            {ymm}
            <span className="text-slate-500"> — not this VIN</span>
          </p>
        )}
      </dd>
    </div>
  );
}

/**
 * City / highway / combined as figures, not a jammed "24 city / 34 hwy" line.
 * Labelled as a model-year EPA listing — never a reading from this VIN.
 */
function EpaMpgFigures({ mpg }: { mpg: ModelMpg }) {
  const figures = mpgFigureRows(mpg);

  return (
    <div>
      <dt
        id="epa-mpg-heading"
        className="text-[11px] font-semibold uppercase tracking-wider text-slate-400"
      >
        {EPA_MPG_TITLE}
      </dt>
      <dd className="mt-2">
        <ul
          aria-labelledby="epa-mpg-heading"
          className="grid grid-cols-3 gap-2"
        >
          {figures.map((row) => {
            const combined = row.key === "combined";
            return (
              <li
                key={row.key}
                className={`rounded-xl border px-2 py-3 text-center sm:px-3 ${
                  combined
                    ? "border-amber-300 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                    : "border-amber-200/80 bg-white/80"
                }`}
              >
                <p
                  className={`font-semibold tabular-nums tracking-tight text-slate-900 ${
                    combined ? "text-3xl sm:text-4xl" : "text-2xl sm:text-3xl"
                  }`}
                >
                  {row.value}
                </p>
                <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {row.label}
                </p>
                <p className="text-[11px] text-slate-400">mpg</p>
              </li>
            );
          })}
        </ul>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {mpg.fuelType ? (
            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-amber-200">
              {mpg.fuelType}
            </span>
          ) : null}
          <p className="text-xs leading-relaxed text-slate-500">{EPA_MPG_NOTE}</p>
        </div>
      </dd>
    </div>
  );
}

/**
 * Compact public-records card for this year/make/model.
 *
 * Sits after every VIN history section, in a dashed/amber zone, so it cannot
 * be read as part of this car's records. Labelled as NHTSA/EPA data for the
 * model year — not this VIN. A failed, timed-out or empty fetch — after
 * retries — omits this entire block. No loading stub, no "failed" card.
 */
export function ModelExtrasCard({ extras: cached = null, token }: Props) {
  const [extras, setExtras] = useState<ModelExtras | null>(
    hasModelExtras(cached) ? cleanModelExtras(cached) : null,
  );

  useEffect(() => {
    if (hasModelExtras(cached) || !token) return;
    let live = true;

    (async () => {
      const loaded = await requestPaidModelExtras(token);
      if (live && hasModelExtras(loaded)) setExtras(cleanModelExtras(loaded));
    })();

    return () => {
      live = false;
    };
  }, [cached, token]);

  if (!hasModelExtras(extras)) return null;

  const ymm = extras.ymmLabel;

  return (
    <section
      aria-labelledby="model-zone-heading"
      className="border-t-2 border-dashed border-amber-300 pt-6"
    >
      <p
        id="model-zone-heading"
        className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-900"
      >
        {MODEL_ZONE_TITLE}
      </p>
    <section
      id="model-extras"
      className="scroll-mt-32 rounded-2xl border border-dashed border-amber-300 bg-amber-50/50 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight text-slate-900">
          Also for this model
        </h2>
        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-amber-900 ring-1 ring-amber-200">
          {NOT_THIS_VIN_CHIP}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        {MODEL_ZONE_NOTE} The {ymm} only.
      </p>

      <dl className="mt-4 space-y-3">
        {extras.recalls && (
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              NHTSA recalls
            </dt>
            <dd className="mt-0.5 text-sm text-slate-800">
              {formatCount(extras.recalls.total)}{" "}
              {extras.recalls.total === 1 ? "campaign" : "campaigns"} on record
              for this model year
              <span className="text-slate-500"> — not this VIN</span>
            </dd>
            {extras.recalls.campaigns.length > 0 && (
              <ol className="mt-3 space-y-3">
                {extras.recalls.campaigns.map((campaign, index) => {
                  const hasBody = Boolean(campaign.consequence || campaign.remedy);
                  const face = (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                            Campaign {index + 1} of{" "}
                            {extras.recalls?.campaigns.length}
                          </p>
                          <p className="mt-1 text-sm font-medium leading-snug text-slate-900">
                            {campaign.title}
                          </p>
                          <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                            NHTSA {campaign.campaign}
                          </p>
                        </div>
                        {hasBody && (
                          <Chevron className="disclosure-chevron mt-0.5 text-slate-400" />
                        )}
                      </div>
                      {hasBody && (
                        <span className="when-closed mt-2 flex items-center gap-1 text-sm font-medium text-brand-600">
                          Show details
                          <Chevron />
                        </span>
                      )}
                    </>
                  );
                  const body = (
                    <>
                      {campaign.consequence && (
                          <p className="mt-2 text-sm leading-relaxed break-words text-slate-600">
                          <span className="font-medium text-slate-700">
                            Risk.{" "}
                          </span>
                          {cleanCustomerLine(campaign.consequence)}
                        </p>
                      )}
                      {campaign.remedy && (
                        <p className="mt-1.5 text-sm leading-relaxed break-words text-slate-600">
                          <span className="font-medium text-slate-700">
                            Remedy.{" "}
                          </span>
                          {cleanCustomerLine(campaign.remedy)}
                        </p>
                      )}
                    </>
                  );

                  return (
                    <li
                      key={campaign.campaign}
                      className="rounded-xl border border-amber-200/80 bg-white/70 px-3 py-3 sm:px-4"
                    >
                      {hasBody ? (
                        <ScrollOpenDetails
                          className="scroll-mt-32"
                          summaryClassName="cursor-pointer list-none [&::-webkit-details-marker]:hidden"
                          summary={face}
                        >
                          {body}
                        </ScrollOpenDetails>
                      ) : (
                        face
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}

        {extras.complaints && (
          <OwnerComplaints ymm={ymm} complaints={extras.complaints} />
        )}

        {extras.mpg && <EpaMpgFigures mpg={extras.mpg} />}
      </dl>
    </section>
    </section>
  );
}
