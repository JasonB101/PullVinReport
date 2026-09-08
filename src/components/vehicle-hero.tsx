"use client";

import { useEffect, useState } from "react";

import { HERO_LABEL, SAMPLE_HERO_SRC } from "@/lib/vehicle-hero";

type Props = {
  /** Cached drawing for this year/make/model/trim/color, if we already have one. */
  src?: string | null;
  /** Access token, given only when a missing hero may be requested. */
  token?: string;
  /** Stable sample illustration. Never generated, never a paid call. */
  sample?: boolean;
  alt: string;
};

/**
 * Cutout vehicle on the report card, to the right of the details on wide
 * screens. Fetched after the records are already on screen, the way the brief
 * is. Missing key or a failed draw leave nothing here — the report is unchanged.
 * The badge is on the picture itself so a skim cannot read it as this VIN.
 */
export function VehicleHero({ src: cached = null, token, sample = false, alt }: Props) {
  const [src, setSrc] = useState<string | null>(sample ? SAMPLE_HERO_SRC : cached);

  useEffect(() => {
    if (sample || cached || !token) return;
    let live = true;

    (async () => {
      try {
        const response = await fetch("/api/vehicle-hero", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const payload = (await response.json()) as { status?: string; src?: string };
        if (!live) return;
        if (payload.status === "ready" && payload.src) setSrc(payload.src);
      } catch {
        /* The report stays as it was. */
      }
    })();

    return () => {
      live = false;
    };
  }, [cached, sample, token]);

  if (!src) return null;

  return (
    <figure className="relative mx-auto w-full max-w-md shrink-0 md:mx-0 md:w-[min(46%,22rem)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="h-auto w-full object-contain object-center"
      />
      <figcaption className="absolute bottom-1 left-1 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700 ring-1 ring-slate-200">
        {HERO_LABEL}
      </figcaption>
    </figure>
  );
}
