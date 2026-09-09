"use client";

import { useEffect, useState } from "react";

import type { VehicleBrief } from "@/lib/ai-brief";
import { cleanBrief, cleanCustomerText } from "@/lib/customer-text";
import {
  COMMON_FOR_MODEL,
  FROM_THIS_VIN,
  NOT_THIS_VIN_CHIP,
  QUESTIONS_HEADING,
  THIS_VIN_CHIP,
} from "@/lib/report-zones";

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
          <span className="min-w-0 whitespace-pre-line break-words">
            {cleanCustomerText(item)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The brief at the top of a paid report.
 *
 * Two fenced lists, never merged: what this VIN's records say, then what this
 * year/make/model tends to do. Questions stay with the VIN block. Every
 * model-level block carries "Not this VIN" on the heading and the chip.
 *
 * Rendered client-side because the brief is fetched after the report is already
 * on screen: the records are what the buyer paid for and they never wait on this.
 */
export function AiBrief({ brief: cached = null, token }: Props) {
  const [brief, setBrief] = useState<VehicleBrief | null>(
    cached ? cleanBrief(cached) : cached,
  );
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
        if (payload.status === "ready" && payload.brief) {
          setBrief(cleanBrief(payload.brief));
        }
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
        <div className="mt-5 border-t border-brand-100 pt-5">
          <p className="text-sm font-medium text-brand-900">
            Writing your brief…
          </p>
          <p className="mt-1 text-xs text-brand-900/60">
            The findings above are complete and do not depend on it.
          </p>
        </div>
      );
    }
    if (failed) {
      return (
        <p className="mt-5 text-xs text-slate-400">
          A written brief isn&apos;t available for this report. Every record is
          below.
        </p>
      );
    }
    return null;
  }

  return (
    <div className="mt-5 border-t border-brand-100 pt-5">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {FROM_THIS_VIN}
          </h3>
          <span className="rounded-full bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
            {THIS_VIN_CHIP}
          </span>
        </div>
        <Bullets items={brief.fromReport} tone="ink" />

        {brief.questions.length > 0 && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {QUESTIONS_HEADING}
            </h3>
            <Bullets items={brief.questions} tone="ink" />
          </div>
        )}

        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          Written automatically from the records in this report. It can only
          summarise what those records say — read them for yourself before you
          decide.
        </p>
      </div>

      {brief.commonForModel.length > 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-amber-300 bg-amber-50/70 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-900">
              {COMMON_FOR_MODEL}
            </h3>
            <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium text-amber-900 ring-1 ring-amber-200">
              {NOT_THIS_VIN_CHIP}
            </span>
          </div>
          <Bullets items={brief.commonForModel} tone="amber" />
          <p className="mt-3 text-xs leading-relaxed text-amber-900/70">
            These are known issues for this year, make and model — not findings
            on this VIN. Treat them as things to check, not records from this
            report.
          </p>
        </div>
      )}
    </div>
  );
}
