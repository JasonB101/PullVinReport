"use client";

import { useEffect, useState } from "react";

import { MpgFigures } from "@/components/mpg-figures";
import { ScrollOpenDetails } from "@/components/scroll-open-details";
import { cleanCustomerLine, cleanModelExtras } from "@/lib/customer-text";
import type {
  ModelComplaints,
  ModelEv,
  ModelExtras,
  ModelMpg,
  ModelOwnership,
  ModelRecall,
  ModelRecalls,
  ModelSafetyRatings,
  RecallBadge,
} from "@/lib/model-extras";
import {
  campaignBadges,
  complaintSamples,
  formatUsdEstimate,
  hasEvCard,
  hasModelExtras,
  hasOwnership,
  hasSafetyRatings,
  mpgFigureRows,
  recallHeaderBadges,
  requestPaidModelExtras,
  safetyCategoryRows,
  safetyOverallFigure,
  youSaveSpendCopy,
} from "@/lib/model-extras";
import {
  NHTSA_STAR_MAX,
  STAR_PATH,
  nhtsaStarLabel,
  nhtsaStarScore,
  nhtsaStarSlots,
} from "@/lib/safety-stars";
import {
  EPA_EV_NOTE,
  EPA_EV_TITLE,
  EPA_MPG_NOTE,
  EPA_MPG_TITLE,
  EPA_OWNERSHIP_NOTE,
  EPA_OWNERSHIP_TITLE,
  MODEL_ZONE_NOTE,
  MODEL_ZONE_TITLE,
  NOT_THIS_VIN_CHIP,
  SAFETY_RATINGS_NOTE,
  SAFETY_RATINGS_TITLE,
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
  return (
    <div>
      <MpgFigures
        headingId="epa-mpg-heading"
        heading={EPA_MPG_TITLE}
        figures={mpgFigureRows(mpg)}
        note={EPA_MPG_NOTE}
        fuelType={mpg.fuelType}
        tone="amber"
        emphasize="combined"
      />
    </div>
  );
}

function RecallBadgePills({ badges }: { badges: RecallBadge[] }) {
  if (badges.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {badges.map((badge) => {
        const tone =
          badge.key === "parkIt" || badge.key === "parkOutSide"
            ? "bg-red-50 text-red-900 ring-red-200"
            : badge.key === "takata"
              ? "bg-amber-100 text-amber-950 ring-amber-300"
              : "bg-slate-100 text-slate-700 ring-slate-200";
        return (
          <li key={badge.key}>
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${tone}`}
            >
              {badge.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function StarGlyph({
  filled,
  className,
}: {
  filled: boolean;
  className: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`shrink-0 ${filled ? "text-slate-800" : "text-sky-200"} ${className}`}
    >
      <path d={STAR_PATH} fill="currentColor" />
    </svg>
  );
}

function NhtsaStars({
  rating,
  label,
  size = "sm",
}: {
  rating: number;
  label: string;
  size?: "lg" | "sm";
}) {
  const glyph = size === "lg" ? "h-6 w-6 sm:h-7 sm:w-7" : "h-4 w-4";
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={nhtsaStarLabel(label, rating)}
    >
      {nhtsaStarSlots(rating).map((filled, index) => (
        <StarGlyph key={index} filled={filled} className={glyph} />
      ))}
    </span>
  );
}

function SafetyRatingsCard({ ratings }: { ratings: ModelSafetyRatings }) {
  const overall = safetyOverallFigure(ratings);
  const categories = safetyCategoryRows(ratings);
  if (!overall && categories.length === 0) return null;
  return (
    <div
      id="model-safety-ratings"
      className="rounded-xl border border-sky-200 bg-sky-50/70 p-4"
    >
      <p
        id="safety-ratings-heading"
        className="text-[11px] font-semibold uppercase tracking-wider text-sky-800"
      >
        {SAFETY_RATINGS_TITLE}
      </p>
      {overall && (
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-sky-300 bg-white px-3 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:px-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {overall.label}
            </p>
            <div className="mt-1.5">
              <NhtsaStars rating={overall.value} label={overall.label} size="lg" />
            </div>
          </div>
          <p
            className="text-3xl font-semibold tabular-nums tracking-tight text-slate-900 sm:text-4xl"
            aria-label={nhtsaStarScore(overall.value)}
          >
            {overall.value}
            <span className="ml-0.5 text-sm font-medium text-slate-400">
              /{NHTSA_STAR_MAX}
            </span>
          </p>
        </div>
      )}
      {categories.length > 0 && (
        <ul
          aria-labelledby="safety-ratings-heading"
          className={`divide-y divide-sky-100 ${overall ? "mt-2" : "mt-3"}`}
        >
          {categories.map((row) => (
            <li
              key={row.key}
              className="flex items-center justify-between gap-3 py-2 first:pt-1 last:pb-0"
            >
              <span className="text-sm text-slate-700">{row.label}</span>
              <NhtsaStars rating={row.value} label={row.label} />
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2.5 text-xs leading-relaxed text-slate-500">
        {ratings.vehicleDescription ? `${ratings.vehicleDescription}. ` : ""}
        {SAFETY_RATINGS_NOTE}
      </p>
    </div>
  );
}

function OwnershipEconomics({ ownership }: { ownership: ModelOwnership }) {
  const rows: { key: string; label: string; value: string; hint: string }[] = [];
  if (ownership.annualFuelCost !== undefined) {
    rows.push({
      key: "fuel",
      label: "Annual fuel cost",
      value: formatUsdEstimate(ownership.annualFuelCost),
      hint: "Estimate",
    });
  }
  if (ownership.youSaveSpend !== undefined) {
    rows.push({
      key: "save",
      label: "5-year vs average",
      value: youSaveSpendCopy(ownership.youSaveSpend),
      hint: "Estimate",
    });
  }
  if (ownership.feScore !== undefined) {
    rows.push({
      key: "fe",
      label: "Fuel economy score",
      value: `${ownership.feScore}/10`,
      hint: "EPA",
    });
  }
  if (ownership.ghgScore !== undefined) {
    rows.push({
      key: "ghg",
      label: "GHG score",
      value: `${ownership.ghgScore}/10`,
      hint: "EPA",
    });
  }
  if (ownership.co2 !== undefined) {
    rows.push({
      key: "co2",
      label: "Tailpipe CO₂",
      value: `${ownership.co2.toLocaleString("en-US")} g/mi`,
      hint: "EPA",
    });
  }
  if (rows.length === 0) return null;

  return (
    <div>
      <p
        id="epa-ownership-heading"
        className="text-[11px] font-semibold uppercase tracking-wider text-slate-400"
      >
        {EPA_OWNERSHIP_TITLE}
      </p>
      <ul
        aria-labelledby="epa-ownership-heading"
        className={`mt-2 grid gap-2 ${rows.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}
      >
        {rows.map((row) => (
          <li
            key={row.key}
            className="rounded-xl border border-amber-200/80 bg-white/80 px-3 py-3"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {row.label}
            </p>
            <p className="mt-1 text-sm font-semibold leading-snug text-slate-900">
              {row.value}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">{row.hint}</p>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-xs leading-relaxed text-slate-500">
        {EPA_OWNERSHIP_NOTE}
      </p>
    </div>
  );
}

function EvChargeCard({ ev }: { ev: ModelEv }) {
  const facts: { key: string; label: string; value: string }[] = [];
  if (ev.range !== undefined) {
    facts.push({
      key: "range",
      label: ev.kind === "PHEV" ? "Electric range" : "Range",
      value: `${ev.range.toLocaleString("en-US")} mi`,
    });
  }
  if (ev.charge240 !== undefined) {
    facts.push({
      key: "charge240",
      label: "Charge at 240V",
      value: `${ev.charge240} hr`,
    });
  }
  if (ev.charge120 !== undefined) {
    facts.push({
      key: "charge120",
      label: "Charge at 120V",
      value: `${ev.charge120} hr`,
    });
  }
  if (ev.batteryKwh !== undefined) {
    facts.push({
      key: "battery",
      label: "Battery",
      value: `${ev.batteryKwh} kWh`,
    });
  }

  return (
    <div
      id="model-ev"
      className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4"
    >
      <p
        id="epa-ev-heading"
        className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800"
      >
        {EPA_EV_TITLE}
      </p>
      <p className="mt-1 text-xs font-medium text-emerald-900/80">
        {ev.kind === "PHEV" ? "Plug-in hybrid" : "Electric"} · EPA listing
      </p>
      {facts.length > 0 && (
        <ul className="mt-2 grid grid-cols-2 gap-2">
          {facts.map((row) => (
            <li
              key={row.key}
              className="rounded-xl border border-emerald-200/80 bg-white/80 px-3 py-3"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {row.label}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{row.value}</p>
            </li>
          ))}
        </ul>
      )}
      {ev.mpge && (
        <div className="mt-3">
          <MpgFigures
            headingId="epa-ev-mpge-heading"
            heading="MPGe"
            figures={mpgFigureRows({
              city: ev.mpge.city,
              highway: ev.mpge.highway,
              combined: ev.mpge.combined,
              fuelType: "",
            })}
            note={EPA_EV_NOTE}
            tone="amber"
            emphasize="combined"
            unit="MPGe"
          />
        </div>
      )}
      {!ev.mpge && (
        <p className="mt-2.5 text-xs leading-relaxed text-slate-500">{EPA_EV_NOTE}</p>
      )}
    </div>
  );
}

function RecallCampaignFace({
  campaign,
  index,
  total,
  hasBody,
}: {
  campaign: ModelRecall;
  index: number;
  total: number;
  hasBody: boolean;
}) {
  const badges = campaignBadges(campaign);
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Campaign {index + 1} of {total}
          </p>
          <p className="mt-1 text-sm font-medium leading-snug text-slate-900">
            {campaign.title}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-slate-400">
            NHTSA {campaign.campaign}
          </p>
          {badges.length > 0 && (
            <div className="mt-2">
              <RecallBadgePills badges={badges} />
            </div>
          )}
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
}

function NhtsaRecalls({ recalls }: { recalls: ModelRecalls }) {
  const headerBadges = recallHeaderBadges(recalls);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          NHTSA recalls
        </dt>
        <RecallBadgePills badges={headerBadges} />
      </div>
      <dd className="mt-0.5 text-sm text-slate-800">
        {formatCount(recalls.total)}{" "}
        {recalls.total === 1 ? "campaign" : "campaigns"} on record
        for this model year
        <span className="text-slate-500"> — not this VIN</span>
      </dd>
      {recalls.campaigns.length > 0 && (
        <ol className="mt-3 space-y-3">
          {recalls.campaigns.map((campaign, index) => {
            const hasBody = Boolean(
              campaign.consequence || campaign.remedy || campaign.takataNote,
            );
            const body = (
              <>
                {campaign.consequence && (
                  <p className="mt-2 text-sm leading-relaxed break-words text-slate-600">
                    <span className="font-medium text-slate-700">Risk. </span>
                    {cleanCustomerLine(campaign.consequence)}
                  </p>
                )}
                {campaign.remedy && (
                  <p className="mt-1.5 text-sm leading-relaxed break-words text-slate-600">
                    <span className="font-medium text-slate-700">Remedy. </span>
                    {cleanCustomerLine(campaign.remedy)}
                  </p>
                )}
                {campaign.takataNote && (
                  <p className="mt-1.5 text-sm leading-relaxed break-words text-slate-600">
                    <span className="font-medium text-slate-700">Takata. </span>
                    {cleanCustomerLine(campaign.takataNote)}
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
                    summary={
                      <RecallCampaignFace
                        campaign={campaign}
                        index={index}
                        total={recalls.campaigns.length}
                        hasBody={hasBody}
                      />
                    }
                  >
                    {body}
                  </ScrollOpenDetails>
                ) : (
                  <RecallCampaignFace
                    campaign={campaign}
                    index={index}
                    total={recalls.campaigns.length}
                    hasBody={false}
                  />
                )}
              </li>
            );
          })}
        </ol>
      )}
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

      <div className="mt-4 space-y-4">
        {hasSafetyRatings(extras.safetyRatings) && (
          <SafetyRatingsCard ratings={extras.safetyRatings} />
        )}

        <dl className="space-y-3">
          {extras.recalls && <NhtsaRecalls recalls={extras.recalls} />}

          {extras.complaints && (
            <OwnerComplaints ymm={ymm} complaints={extras.complaints} />
          )}

          {hasEvCard(extras.ev) ? (
            <EvChargeCard ev={extras.ev} />
          ) : extras.mpg ? (
            <EpaMpgFigures mpg={extras.mpg} />
          ) : null}

          {hasOwnership(extras.ownership) && (
            <OwnershipEconomics ownership={extras.ownership} />
          )}
        </dl>
      </div>
    </section>
    </section>
  );
}
