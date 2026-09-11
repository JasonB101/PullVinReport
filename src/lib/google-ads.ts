/**
 * Google Ads conversion IDs for vehiclehistorybyvin.com.
 *
 * The base tag (gtag config AW-1844093667) is loaded sitewide so Ads can
 * attribute sessions. The Purchase event is still fired once per order after
 * Stripe has confirmed payment — never on the landing page, the sample
 * report, or an abandoned checkout. Tags are for vehiclehistorybyvin.com only.
 */

export const GOOGLE_ADS_ID = "AW-1844093667";
export const GOOGLE_ADS_PURCHASE_SEND_TO =
  "AW-1844093667/VQOrCJabp_IcEJPRqdlE";
export const GOOGLE_ADS_PURCHASE_VALUE = 14.99;
export const GOOGLE_ADS_PURCHASE_CURRENCY = "USD";

export const GOOGLE_ADS_SCRIPT_SRC = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`;

export type GtagFn = (...args: unknown[]) => void;

export type ConversionStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/** In-memory guard so a remount in the same JS context cannot double-fire. */
const firedOrderIds = new Set<string>();

export function purchaseConversionStorageKey(orderId: string): string {
  return `pvr-aw-purchase:${orderId}`;
}

export function purchaseConversionParams(): {
  send_to: typeof GOOGLE_ADS_PURCHASE_SEND_TO;
  value: typeof GOOGLE_ADS_PURCHASE_VALUE;
  currency: typeof GOOGLE_ADS_PURCHASE_CURRENCY;
} {
  return {
    send_to: GOOGLE_ADS_PURCHASE_SEND_TO,
    value: GOOGLE_ADS_PURCHASE_VALUE,
    currency: GOOGLE_ADS_PURCHASE_CURRENCY,
  };
}

/**
 * True only on the existing Stripe confirmation surfaces: the report page
 * after `/order/success` redirects with `?new=1`, or the paid-but-undelivered
 * success shell. Sample, preview, and unpaid orders stay false.
 */
export function shouldFirePurchaseConversion(input: {
  paid: boolean;
  confirmationPath: boolean;
}): boolean {
  return input.paid && input.confirmationPath;
}

export function firePurchaseConversionOnce(input: {
  orderId: string;
  gtag: GtagFn;
  storage?: ConversionStorage | null;
}): boolean {
  const orderId = input.orderId.trim();
  if (!orderId) return false;
  if (firedOrderIds.has(orderId)) return false;

  const key = purchaseConversionStorageKey(orderId);
  try {
    if (input.storage?.getItem(key)) {
      firedOrderIds.add(orderId);
      return false;
    }
  } catch {
    // Private browsing / blocked storage: fall through to the in-memory guard.
  }

  firedOrderIds.add(orderId);
  try {
    input.storage?.setItem(key, "1");
  } catch {
    // Still fire — the in-memory set covers remounts in this tab.
  }

  input.gtag("event", "conversion", purchaseConversionParams());
  return true;
}

/** Test-only: clear the process-local dedupe set. */
export function resetPurchaseConversionDedupeForTests(): void {
  firedOrderIds.clear();
}
