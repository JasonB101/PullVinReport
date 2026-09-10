/**
 * Sitewide Google Analytics 4 (gtag). Separate from Google Ads Purchase
 * (AW-1844093667 on Stripe success only) and from admin GOOGLE_ADS_* spend.
 *
 * The measurement ID is read only from NEXT_PUBLIC_GA_MEASUREMENT_ID.
 * Blank, missing, or a value that is not a G- id omits the script.
 */

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
