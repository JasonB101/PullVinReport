"use client";

import { useEffect, useState } from "react";

import type { VehicleBrief } from "@/lib/ai-brief";

type Props = {
  /** Present when the brief was already written and cached on the order. */
  brief?: VehicleBrief | null;
  /** The report's access token. Given only when we may ask for a brief. */
  token?: string;
};

function Bullets({ items, tone }: { items: string[]; tone: "ink" | "amber" }) {
  const text = tone === "amber" ? "text-amber-900/90" : "text-slate-700";
  const dot = tone === "amber" ? "bg-amber-500" : "bg-brand-500";

  return (
    <ul className="mt-2 space-y-2">
      {items.map((item, index) => (
        <li key={index} className={`flex gap-2.5 text-sm leading-relaxed ${text}`}>
          <span className={`mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The brief at the top of a paid report.
 *
 * Two lists, never merged: what this report says, and what this model tends to
 * do. The second carries its disclaimer in the heading itself rather than in
 * small print underneath, because a buyer skimming headings is exactly the
 * reader who would otherwise mistake it for their car's history.
 *
 * Rendered client-side because the brief is fetched after the report is already
 * on screen: the records are what the buyer paid for and they never wait on this.
 */
export function AiBrief({ brief: cached = null, token }: Props) {
  const [brief, setBrief] = useState<VehicleBrief | null>(cached);
  const [failed, setFailed] = useState(false);
  const pending = !brief && !failed && Boolean(token);

  useEffect(() => {
    if (cached || !token) return;
    let live = true;

    (async () => {
      try {
        const response = await fetch("/api/brief", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const payload = (await response.json()) as {
          status?: string;
          brief?: VehicleBrief;
        };
        if (!live) return;
        if (payload.status === "ready" && payload.brief) setBrief(payload.brief);
        else setFailed(true);
      } catch {
        if (live) setFailed(true);
      }
    })();

    return () => {
      live = false;
    };
  }, [cached, token]);

  if (!brief) {
    if (pending) {
      return (
        <section className="rounded-2xl border border-brand-100 bg-brand-50/50 p-5 sm:p-6">
          <p className="text-sm font-medium text-brand-900">
            Writing your brief…
          </p>
          <p className="mt-1 text-xs text-brand-900/60">
            The records below are complete and do not depend on it.
          </p>
        </section>
      );
    }
    if (failed) {
      return (
        <p className="px-1 text-xs text-slate-400">
          A written brief isn&apos;t available for this report. Every record is
          below.
        </p>
      );
    }
    return null;
  }

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
          Written from the records below
        </span>
      </div>

      <div className="mt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          From this report
        </h3>
        <Bullets items={brief.fromReport} tone="ink" />
      </div>

      {brief.commonForModel.length > 0 && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-900">
            Common for this model — not confirmed on this VIN
          </h3>
          <Bullets items={brief.commonForModel} tone="amber" />
        </div>
      )}

      {brief.questions.length > 0 && (
        <div className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Questions to ask the seller
          </h3>
          <Bullets items={brief.questions} tone="ink" />
        </div>
      )}

      <p className="mt-5 text-xs leading-relaxed text-slate-500">
        Written automatically from the records in this report. It can only
        summarise what those records say — read them for yourself before you
        decide, and treat the model-level notes as things to check, not findings.
      </p>
    </section>
  );
}
