"use client";

import { useEffect, useId, useRef, useState } from "react";

import { HERO_DRAFT_COPY, SAMPLE_HERO_SRC } from "@/lib/vehicle-hero";

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
 * How long a URL may sit in the DOM before we cover it with the draft layer.
 * Cached hits and the sample SVG typically decode before this, so they never
 * flash a placeholder. A generate-in-flight has no URL and drafts immediately.
 */
export const HERO_DRAFT_REVEAL_MS = 120;

/**
 * Cutout vehicle on the report card, to the right of the details on wide
 * screens. Fetched after the records are already on screen, the way the brief
 * is. A failed draw after the sketch was already up keeps a quiet reserved
 * slot so the header does not collapse. A report that never offered a hero
 * still renders without one.
 *
 * While a drawing is in flight (or the browser is still decoding one), the
 * slot holds a sketch so the header never reads as a blank hole.
 */
export function VehicleHero({ src: cached = null, token, sample = false, alt }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [src, setSrc] = useState<string | null>(sample ? SAMPLE_HERO_SRC : cached);
  const [readySrc, setReadySrc] = useState<string | null>(null);
  const [slowForSrc, setSlowForSrc] = useState<string | null>(null);
  const [awaitingGenerated, setAwaitingGenerated] = useState(false);
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const offeredSlot = !sample && Boolean(token || cached);

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
  }, [cached, sample, token]);

  const pixelsReady = Boolean(src && readySrc === src);
  const slowLoad = Boolean(src && slowForSrc === src && !pixelsReady);
  const generating = !src && Boolean(token) && !failed;
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

  if (!src && !token && !sample && !failedEmpty) return null;

  const imageVisible = pixelsReady || Boolean(src && !drafting);
  const keepSketchLayer = offeredSlot || drafting || failedEmpty;
  const sketchVisible = drafting || failedEmpty;

  return (
    <figure className="mx-auto w-full max-w-md shrink-0 md:mx-0 md:w-[min(46%,22rem)]">
      <div className={`relative w-full ${reserveHeight ? "min-h-[11rem] sm:min-h-[12.5rem]" : ""}`}>
        {keepSketchLayer && (
          <div
            className={`hero-draft-layer no-print absolute inset-0 z-0 flex items-center justify-center transition-opacity duration-700 ease-out ${
              sketchVisible ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
            aria-hidden={!drafting}
          >
            <HeroDraftPlaceholder uid={uid} quiet={failedEmpty} />
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
    </figure>
  );
}

function HeroDraftPlaceholder({ uid, quiet = false }: { uid: string; quiet?: boolean }) {
  const washId = `hero-draft-wash-${uid}`;
  const sheenId = `hero-draft-sheen-${uid}`;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-2 py-1">
      <div className="relative w-full overflow-hidden rounded-xl">
        <svg
          viewBox="0 0 320 190"
          className="hero-draft-sketch mx-auto block h-auto w-full text-slate-400"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={washId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#dbeafe" stopOpacity="0.55" />
              <stop offset="55%" stopColor="#f8fafc" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#e0f2fe" stopOpacity="0.4" />
            </linearGradient>
            <linearGradient id={sheenId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="50%" stopColor="#ffffff" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
          </defs>

          <rect width="320" height="190" fill={`url(#${washId})`} />

          <g
            className={quiet ? undefined : "hero-draft-guide"}
            fill="none"
            stroke="currentColor"
            strokeWidth="0.6"
            opacity="0.28"
          >
            <line x1="24" y1="28" x2="296" y2="28" />
            <line x1="24" y1="162" x2="296" y2="162" />
            <line x1="40" y1="20" x2="40" y2="170" />
            <line x1="280" y1="20" x2="280" y2="170" />
            <line x1="16" y1="148" x2="304" y2="148" />
          </g>

          <g
            fill="none"
            stroke="#64748b"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle
              className={quiet ? undefined : "hero-draft-stroke"}
              cx="96"
              cy="142"
              r="24"
              strokeWidth="1.3"
            />
            <circle
              className={quiet ? undefined : "hero-draft-stroke"}
              cx="228"
              cy="142"
              r="24"
              strokeWidth="1.3"
            />
            <circle cx="96" cy="142" r="9" strokeWidth="1" opacity="0.45" />
            <circle cx="228" cy="142" r="9" strokeWidth="1" opacity="0.45" />

            <path
              className={quiet ? undefined : "hero-draft-stroke"}
              strokeWidth="1.7"
              d="M42 140c6-28 22-44 48-52l28-28c8-8 16-12 36-12h52c22 0 36 8 50 24l22 16c10 4 18 12 22 28 2 8 6 18 8 24"
            />
            <path
              className={quiet ? undefined : "hero-draft-stroke"}
              strokeWidth="1.35"
              d="M54 128h28c6-18 16-30 34-38m48-2c22 4 40 16 54 34h36"
            />
            <path
              className={quiet ? undefined : "hero-draft-guide"}
              strokeWidth="1"
              d="M118 78c18-2 40-2 58 6M86 118h36M196 116h40"
              opacity="0.55"
            />
          </g>

          {!quiet && (
            <>
              <rect
                className="hero-draft-shimmer"
                x="-80"
                y="0"
                width="90"
                height="190"
                fill={`url(#${sheenId})`}
              />
              <g className="hero-draft-pencil text-brand-600">
                <g transform="translate(248 44) rotate(-18)">
                  <rect x="0" y="0" width="7" height="22" rx="1.2" fill="currentColor" />
                  <rect x="0.8" y="1.2" width="5.4" height="6" rx="0.6" fill="#dbeafe" />
                  <path d="M0.6 22h5.8L3.5 30Z" fill="#cbd5e1" />
                  <path d="M2.2 26.6h2.6L3.5 30Z" fill="#334155" />
                </g>
              </g>
            </>
          )}
        </svg>
      </div>
      {!quiet && (
        <p
          className="mt-2 text-center text-xs font-medium tracking-wide text-slate-500"
          role="status"
        >
          {HERO_DRAFT_COPY}
        </p>
      )}
    </div>
  );
}
