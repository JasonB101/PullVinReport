"use client";

import { useEffect, useId, useRef, useState } from "react";

import { HERO_DRAFT_COPY, SAMPLE_HERO_SRC } from "@/lib/vehicle-hero";

type Props = {
  /** Cached drawing for this year/make/model/trim/color, if we already have one. */
  src?: string | null;
  /** Access token, given only when a missing paid-report hero may be requested. */
  token?: string;
  /** VIN, given on the pre-pay preview so a missing hero may be requested. */
  vin?: string;
  /** Stable sample illustration. Never generated, never a paid call. */
  sample?: boolean;
  alt: string;
  /** Print-style honesty line. Preview shows it; the paid cutout does not. */
  caption?: string | null;
};

/**
 * How long a URL may sit in the DOM before we cover it with the draft layer.
 * Cached hits and the sample PNG typically decode before this, so they never
 * flash a placeholder. A generate-in-flight has no URL and drafts immediately.
 */
export const HERO_DRAFT_REVEAL_MS = 120;

/**
 * Cutout vehicle on the report card, to the right of the details on wide
 * screens. Fetched after the records are already on screen, the way the brief
 * is. A failed draw after the plate was already up keeps a quiet reserved
 * slot so the header does not collapse. A report that never offered a hero
 * still renders without one.
 *
 * While a drawing is in flight (or the browser is still decoding one), the
 * slot holds a branded identity plate — never a cartoon car.
 */
export function VehicleHero({
  src: cached = null,
  token,
  vin,
  sample = false,
  alt,
  caption = null,
}: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [src, setSrc] = useState<string | null>(sample ? SAMPLE_HERO_SRC : cached);
  const [readySrc, setReadySrc] = useState<string | null>(null);
  const [slowForSrc, setSlowForSrc] = useState<string | null>(null);
  const [awaitingGenerated, setAwaitingGenerated] = useState(false);
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const canGenerate = Boolean(token || vin);
  const offeredSlot = !sample && Boolean(canGenerate || cached);

  useEffect(() => {
    if (sample || cached || !canGenerate) return;
    let live = true;

    (async () => {
      try {
        const response = await fetch("/api/vehicle-hero", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(token ? { token } : { vin }),
        });
        const payload = (await response.json()) as { status?: string; src?: string };
        if (!live) return;
        if (payload.status === "ready" && payload.src) {
          setAwaitingGenerated(true);
          setSrc(payload.src);
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
  }, [cached, canGenerate, sample, token, vin]);

  const pixelsReady = Boolean(src && readySrc === src);
  const slowLoad = Boolean(src && slowForSrc === src && !pixelsReady);
  const generating = !src && canGenerate && !failed;
  const drafting =
    !sample && !failed && !pixelsReady && (generating || slowLoad || awaitingGenerated);
  const failedEmpty = Boolean(failed && !src && offeredSlot);
  const reserveHeight = drafting || failedEmpty;

  useEffect(() => {
    if (sample || !src || pixelsReady) return;
    const timer = window.setTimeout(() => setSlowForSrc(src), HERO_DRAFT_REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [sample, src, pixelsReady]);

  useEffect(() => {
    const img = imgRef.current;
    if (!src || !img?.complete || img.naturalWidth === 0) return;
    const frame = window.requestAnimationFrame(() => {
      setReadySrc(src);
      setAwaitingGenerated(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [src]);

  function markPixelsReady() {
    if (!src) return;
    setReadySrc(src);
    setAwaitingGenerated(false);
  }

  if (!src && !canGenerate && !sample && !failedEmpty) return null;

  const imageVisible = pixelsReady || Boolean(src && !drafting);
  const keepPlateLayer = offeredSlot || drafting || failedEmpty;
  const plateVisible = drafting || failedEmpty;
  const shownCaption = caption && imageVisible ? caption : null;

  return (
    <figure className="mx-auto w-full max-w-[13.5rem] shrink-0 sm:max-w-md md:mx-0 md:w-[min(46%,22rem)]">
      <div className={`relative w-full ${reserveHeight ? "min-h-[11rem] sm:min-h-[12.5rem]" : ""}`}>
        {keepPlateLayer && (
          <div
            className={`hero-draft-layer no-print absolute inset-0 z-0 flex items-center justify-center transition-opacity duration-700 ease-out ${
              plateVisible ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
            aria-hidden={!drafting}
          >
            <HeroIdentityPlate uid={uid} quiet={failedEmpty} />
          </div>
        )}
        {src ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            ref={imgRef}
            src={src}
            alt={alt}
            onLoad={markPixelsReady}
            onError={() => {
              setFailed(true);
              setAwaitingGenerated(false);
              setSrc(null);
            }}
            className={`relative z-10 h-auto w-full object-contain object-center transition-opacity duration-700 ease-out ${
              imageVisible ? "opacity-100" : "opacity-0"
            }`}
          />
        ) : null}
      </div>
      {shownCaption ? (
        <figcaption className="mt-2 text-center text-[11px] font-medium tracking-wide text-slate-400">
          {shownCaption}
        </figcaption>
      ) : null}
    </figure>
  );
}

export function HeroIdentityPlate({ uid, quiet = false }: { uid: string; quiet?: boolean }) {
  const sheenId = `hero-draft-sheen-${uid}`;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-2 py-1">
      <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
        <div
          className="absolute inset-0 bg-[radial-gradient(18rem_12rem_at_100%_0%,rgba(37,99,235,0.10),transparent_58%),radial-gradient(14rem_10rem_at_0%_120%,rgba(14,165,233,0.07),transparent_52%)]"
          aria-hidden="true"
        />
        <div className="relative flex aspect-[16/10] flex-col items-center justify-center px-5 py-6 text-center">
          {!quiet && (
            <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
              <defs>
                <linearGradient id={sheenId} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
                  <stop offset="50%" stopColor="#ffffff" stopOpacity="0.7" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                </linearGradient>
              </defs>
              <rect
                className="hero-draft-shimmer"
                x="-80"
                y="0"
                width="90"
                height="190"
                fill={`url(#${sheenId})`}
              />
            </svg>
          )}
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-[0_8px_20px_-8px_rgba(37,99,235,0.85)]">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="5" y="4" width="14" height="16" rx="2" />
              <path d="M8 9h8M8 13h8M8 17h5" />
            </svg>
          </span>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Factory identity
          </p>
          <p className="mt-1 text-xs leading-snug text-slate-400">
            {quiet ? "Decoded from this VIN" : HERO_DRAFT_COPY}
          </p>
        </div>
      </div>
    </div>
  );
}
