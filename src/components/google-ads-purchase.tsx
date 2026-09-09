"use client";

import Script from "next/script";

import {
  GOOGLE_ADS_ID,
  GOOGLE_ADS_SCRIPT_SRC,
  firePurchaseConversionOnce,
  type GtagFn,
} from "@/lib/google-ads";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: GtagFn;
  }
}

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function ensureGtag(): GtagFn {
  const dataLayer = (window.dataLayer ??= []);
  if (typeof window.gtag === "function") return window.gtag;
  const gtag: GtagFn = (...args) => {
    dataLayer.push(args);
  };
  window.gtag = gtag;
  return gtag;
}

/**
 * Loads the Google Ads tag and fires Purchase once for a paid order.
 *
 * Mount this only on Stripe confirmation UI (`/report/[token]?new=1` or the
 * paid-but-undelivered `/order/success` shell). Do not mount on sample,
 * preview, or unpaid flows.
 */
export function GoogleAdsPurchase({ orderId }: { orderId: string }) {
  function onGtagReady() {
    const gtag = ensureGtag();
    gtag("js", new Date());
    gtag("config", GOOGLE_ADS_ID);
    firePurchaseConversionOnce({
      orderId,
      gtag,
      storage: browserStorage(),
    });
  }

  return (
    <Script
      src={GOOGLE_ADS_SCRIPT_SRC}
      strategy="afterInteractive"
      onReady={onGtagReady}
    />
  );
}
