/**
 * Sitewide Google tag (gtag). Configures GA4 when NEXT_PUBLIC_GA_MEASUREMENT_ID
 * is a G- id, and always configs Google Ads AW-1844093667 on the same snippet.
 *
 * The Purchase conversion stays on Stripe success only — this module never
 * emits a conversion event. Admin GOOGLE_ADS_* spend credentials are unrelated.
 *
 * Tags are for vehiclehistorybyvin.com only.
 */

import { GOOGLE_ADS_ID, GOOGLE_ADS_SCRIPT_SRC } from "@/lib/google-ads";

export const GA_SCRIPT_ORIGIN = "https://www.googletagmanager.com/gtag/js";

const GA_MEASUREMENT_ID_RE = /^G-[A-Z0-9]+$/i;

export function gaMeasurementId(
  raw: string | undefined = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
): string | undefined {
  const value = raw?.trim();
  if (!value || !GA_MEASUREMENT_ID_RE.test(value)) return undefined;
  return value;
}

export function gaScriptSrc(measurementId: string): string {
  return `${GA_SCRIPT_ORIGIN}?id=${encodeURIComponent(measurementId)}`;
}

/** One gtag.js URL. Prefer the GA4 id when set so production matches the live preload. */
export function sitewideGtagScriptSrc(measurementId?: string): string {
  return measurementId ? gaScriptSrc(measurementId) : GOOGLE_ADS_SCRIPT_SRC;
}

/**
 * Inline gtag bootstrap: optional GA4 config, always the Ads AW config.
 * Does not fire Purchase or any other conversion event.
 */
export function sitewideGtagInlineScript(measurementId?: string): string {
  const lines = [
    "window.dataLayer = window.dataLayer || [];",
    "function gtag(){dataLayer.push(arguments);}",
    "gtag('js', new Date());",
  ];
  if (measurementId) {
    lines.push(`gtag('config', ${JSON.stringify(measurementId)});`);
  }
  lines.push(`gtag('config', ${JSON.stringify(GOOGLE_ADS_ID)});`);
  return `\n${lines.join("\n")}\n`;
}
