"use client";

import { useEffect, useState } from "react";

import { ScrollOpenDetails } from "@/components/scroll-open-details";
import type { ModelExtras } from "@/lib/model-extras";
import { hasModelExtras } from "@/lib/model-extras";
import { MODEL_ZONE_NOTE, NOT_THIS_VIN_CHIP } from "@/lib/report-zones";

type Props = {
  /** Already-summarised extras, from a cache hit or the sample fixture. */
  extras?: ModelExtras | null;
  /** Access token, given only when a missing card may be requested. */
  token?: string;
};

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * Compact public-records card for this year/make/model.
 *
 * Sits after every VIN history section, in a dashed/amber zone, so it cannot
 * be read as part of this car's records. Labelled as NHTSA/EPA data for the
 * model year — not this VIN. A failed or empty fetch leaves nothing here.
 */
export function ModelExtrasCard({ extras: cached = null, token }: Props) {
  const [extras, setExtras] = useState<ModelExtras | null>(
    hasModelExtras(cached) ? cached : null,
  );
  const [failed, setFailed] = useState(false);
  const pending = !extras && !failed && Boolean(token) && !hasModelExtras(cached);

  useEffect(() => {
    if (hasModelExtras(cached) || !token) return;
    let live = true;

    (async () => {
      try {
        const response = await fetch("/api/model-extras", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const payload = (await response.json()) as {
          status?: string;
          extras?: ModelExtras;
        };
        if (!live) return;
        if (payload.status === "ready" && hasModelExtras(payload.extras)) {
          setExtras(payload.extras);
        } else {
          setFailed(true);
        }
      } catch {
        if (live) setFailed(true);
      }
    })();

    return () => {
      live = false;
    };
  }, [cached, token]);

  if (!extras) {
    if (!pending) return null;
    return (
      <section
        id="model-extras"
        aria-busy="true"
        className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/50 px-5 py-4 sm:px-6"
      >
        <p className="text-sm text-slate-500">
          Checking public records for this model…
        </p>
      </section>
    );
  }

  const ymm = extras.ymmLabel;
  const hasDetails = Boolean(extras.recalls && extras.recalls.campaigns.length > 0);

  return (
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
              {extras.recalls.campaigns.length > 0 && (
                <span className="text-slate-500">
                  {" "}
                  · {extras.recalls.campaigns.map((row) => row.title).join("; ")}
                </span>
              )}
            </dd>
          </div>
        )}

        {extras.complaints && (
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Owner complaints
            </dt>
            <dd className="mt-0.5 text-sm text-slate-800">
              {formatCount(extras.complaints.total)} owner{" "}
              {extras.complaints.total === 1 ? "complaint" : "complaints"} filed
              for the {ymm}
              <span className="text-slate-500"> — not this VIN</span>
              {extras.complaints.themes.length > 0 && (
                <span className="text-slate-500">
                  . Most-named components:{" "}
                  {extras.complaints.themes
                    .map((theme) => theme.component)
                    .join(", ")}
                  .
                </span>
              )}
            </dd>
          </div>
        )}

        {extras.mpg && (
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              EPA fuel economy
            </dt>
            <dd className="mt-0.5 text-sm text-slate-800">
              {extras.mpg.city} city / {extras.mpg.highway} hwy /{" "}
              {extras.mpg.combined} combined mpg
              {extras.mpg.fuelType ? ` · ${extras.mpg.fuelType}` : ""}
              <span className="text-slate-500">
                {" "}
                for this model year, when the EPA listing matches — not this VIN
              </span>
            </dd>
          </div>
        )}
      </dl>

      {hasDetails && extras.recalls && (
        <ScrollOpenDetails
          className="mt-3 scroll-mt-32"
          summaryClassName="cursor-pointer list-none text-sm [&::-webkit-details-marker]:hidden"
          summary={
            <span className="when-closed font-medium text-brand-600">
              Campaign details
            </span>
          }
        >
          <ul className="mt-3 space-y-3 border-t border-slate-100 pt-3">
            {extras.recalls.campaigns.map((campaign) => (
              <li key={campaign.campaign} className="text-sm leading-relaxed">
                <p className="font-medium text-slate-900">{campaign.title}</p>
                <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                  NHTSA {campaign.campaign}
                </p>
                {campaign.consequence && (
                  <p className="mt-1 text-slate-600">
                    <span className="font-medium text-slate-700">Risk. </span>
                    {campaign.consequence}
                  </p>
                )}
                {campaign.remedy && (
                  <p className="mt-1 text-slate-600">
                    <span className="font-medium text-slate-700">Remedy. </span>
                    {campaign.remedy}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </ScrollOpenDetails>
      )}
    </section>
  );
}
