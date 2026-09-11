import Script from "next/script";

import {
  gaMeasurementId,
  sitewideGtagInlineScript,
  sitewideGtagScriptSrc,
} from "@/lib/google-analytics";

/**
 * Sitewide Google tag: gtag.js plus config for GA4 (when set) and
 * Google Ads AW-18440939667. The Purchase conversion still fires only on
 * Stripe confirmation — this component never sends it.
 */
export function GoogleAnalytics() {
  const measurementId = gaMeasurementId();

  return (
    <>
      <Script
        src={sitewideGtagScriptSrc(measurementId)}
        strategy="afterInteractive"
      />
      <Script id="sitewide-gtag" strategy="afterInteractive">
        {sitewideGtagInlineScript(measurementId)}
      </Script>
    </>
  );
}
