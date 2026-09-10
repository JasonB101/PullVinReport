import Script from "next/script";

import { gaMeasurementId, gaScriptSrc } from "@/lib/google-analytics";

/**
 * Loads gtag.js and configs GA4 for page_view when a measurement ID is set.
 * Renders nothing when NEXT_PUBLIC_GA_MEASUREMENT_ID is unset.
 *
 * Shares the standard dataLayer / gtag bootstrap with the existing Ads
 * Purchase tag, which still loads and fires only on Stripe success.
 */
export function GoogleAnalytics() {
  const measurementId = gaMeasurementId();
  if (!measurementId) return null;

  return (
    <>
      <Script src={gaScriptSrc(measurementId)} strategy="afterInteractive" />
      <Script id="ga4-gtag" strategy="afterInteractive">
        {`
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', ${JSON.stringify(measurementId)});
`}
      </Script>
    </>
  );
}
