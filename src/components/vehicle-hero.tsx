"use client";

import { useEffect, useState } from "react";

import { SAMPLE_HERO_SRC } from "@/lib/vehicle-hero";

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
    <figure className="mx-auto w-full max-w-md shrink-0 md:mx-0 md:w-[min(46%,22rem)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="h-auto w-full object-contain object-center"
      />
    </figure>
  );
}
