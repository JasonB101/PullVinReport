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
                        <p className="mt-2 text-sm leading-relaxed text-slate-600">
                          <span className="font-medium text-slate-700">
                            Risk.{" "}
                          </span>
                          {campaign.consequence}
                        </p>
                      )}
                      {campaign.remedy && (
                        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                          <span className="font-medium text-slate-700">
                            Remedy.{" "}
                          </span>
                          {campaign.remedy}
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
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Owner complaints
            </dt>
            <dd className="mt-0.5">
              {extras.complaints.themes.length > 0 ? (
                <ScrollOpenDetails
                  className="scroll-mt-32"
                  summaryClassName="cursor-pointer list-none [&::-webkit-details-marker]:hidden"
                  summary={
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-slate-800">
                          {formatCount(extras.complaints.total)} owner{" "}
                          {extras.complaints.total === 1
                            ? "complaint"
                            : "complaints"}{" "}
                          filed for the {ymm}
                          <span className="text-slate-500"> — not this VIN</span>
                        </p>
                        <Chevron className="disclosure-chevron mt-0.5 text-slate-400" />
                      </div>
                      <p className="when-closed mt-1.5 text-sm text-slate-600">
                        Most-named:{" "}
                        {extras.complaints.themes
                          .slice(0, 2)
                          .map((theme) => theme.component)
                          .join(", ")}
                        {extras.complaints.themes.length > 2 ? "…" : ""}
                      </p>
                      <span className="when-closed mt-2 flex items-center gap-1 text-sm font-medium text-brand-600">
                        Show {extras.complaints.themes.length}{" "}
                        {extras.complaints.themes.length === 1
                          ? "theme"
                          : "themes"}
                        <Chevron />
                      </span>
                    </>
                  }
                >
                  <ul className="mt-3 space-y-2 border-t border-amber-200/70 pt-3">
                    {extras.complaints.themes.map((theme) => (
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
                  <p className="mt-2 text-xs text-slate-500">
                    Component themes from NHTSA owner complaints for the {ymm}{" "}
                    — not this VIN.
                  </p>
                </ScrollOpenDetails>
              ) : (
                <p className="text-sm text-slate-800">
                  {formatCount(extras.complaints.total)} owner{" "}
                  {extras.complaints.total === 1 ? "complaint" : "complaints"}{" "}
                  filed for the {ymm}
                  <span className="text-slate-500"> — not this VIN</span>
                </p>
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
    </section>
  );
}
