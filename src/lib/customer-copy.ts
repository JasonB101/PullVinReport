/**
 * Buyer-facing copy for things that went wrong.
 *
 * Customers never see environment variable names, provider names or raw error
 * strings — those are operator diagnostics and belong on `/status` and
 * `/admin`, both of which keep the full detail. Every sentence a buyer reads
 * about a failure is produced here so there is a single place to audit that
 * nothing internal leaks out.
 *
 * Deliberately dependency-free so it can be unit tested with the plain Node
 * test runner.
 */

/**
 * The standing disclaimer that travels with a finished report — on screen, in
 * the PDF and in the receipt email. Deliberately says "third-party records"
 * rather than naming a data supplier: who we buy from is our business, not a
 * feature of the product, and naming them only teaches buyers to skip us.
 */
export const REPORT_DISCLAIMER =
  "This report is compiled from third-party records and is provided for informational purposes only. Records are only as complete as what reporting agencies, insurers and states have submitted, so it is not a guarantee about the vehicle, nor a substitute for an independent inspection.";

/** The same promise, trimmed for the site footer and email footer. */
export const REPORT_DISCLAIMER_SHORT =
  "Reports are compiled from third-party records and are provided for informational purposes only. They are not a guarantee about a vehicle's condition and are not a substitute for an in-person inspection.";

/** Shown when a pre-purchase VIN decode returns nothing usable. */
export const VIN_DECODE_UNAVAILABLE =
  "We couldn't decode that VIN yet. It stays valid for checkout — the full report is pulled from a separate set of records after payment.";

/** Shown on `/preview` when the paid path is closed on this deployment. */
export const ORDERING_PAUSED_REASON =
  "We've paused new orders while we restore a service this report depends on. Nothing has been charged.";

/** Shown when we cannot look up a checkout the customer says they completed. */
export const CHECKOUT_UNAVAILABLE_REASON =
  "We can't look up payments right now, so nothing could have been charged on this site.";

/** Shown on `/preview` when Stripe Checkout sent the customer back unpaid. */
export const PAYMENT_CANCELED_MESSAGE =
  "You left Stripe Checkout before the payment went through. Your VIN is still confirmed below — restart checkout whenever you're ready.";

/** What we tell a buyer while a delayed payment method clears. */
export const PAYMENT_PENDING_MESSAGE =
  "Some payment methods take a little longer to clear. As soon as the payment confirms we pull your report and email you the link — you do not need to do anything.";

/**
 * Failure categories a buyer can be told about, in their language rather than
 * ours. The raw cause is recorded on the order for the admin console.
 */
export type FailureKind =
  /** The provider had nothing on file for this VIN. */
  | "no-records"
  /** We could reach the records system but it refused or errored. */
  | "provider-unavailable"
  /** The order exists but we could not match it to a completed payment. */
  | "unmatched-payment"
  /** Anything else. */
  | "unknown";

const FAILURE_MESSAGES: Record<FailureKind, string> = {
  "no-records":
    "No history records came back for this VIN. That usually means the vehicle has never been titled, insured or auctioned in a way the records system tracks — not that we made a mistake.",
  "provider-unavailable":
    "The records system we buy from was unavailable when we tried to pull your report.",
  "unmatched-payment":
    "We couldn't match that checkout to an order on our side.",
  unknown: "Something went wrong on our side while preparing this report.",
};

const NO_RECORD_PATTERNS = [
  /no\s+(?:report|record|data|result)/i,
  /could\s+not\s+produce\s+a\s+report/i,
  /not\s+found/i,
];

/**
 * Buckets a raw provider or fulfillment error into something we are willing to
 * show a buyer. Anything unrecognised falls through to the generic message, so
 * a new error string can never leak by default.
 */
export function classifyFailure(detail?: string | null): FailureKind {
  if (!detail) return "unknown";
  if (NO_RECORD_PATTERNS.some((pattern) => pattern.test(detail))) {
    return "no-records";
  }
  if (/not configured|missing|unavailable|timed out|did not respond|could not reach|HTTP \d{3}/i.test(detail)) {
    return "provider-unavailable";
  }
  return "unknown";
}

/** The sentence a buyer reads about a failed pull. */
export function customerFailureMessage(kind: FailureKind): string {
  return FAILURE_MESSAGES[kind];
}

/**
 * What happens next after a failed pull, phrased around the refund promise we
 * make before checkout.
 *
 * @param priceLabel Already-formatted price, e.g. `$14.99`.
 * @param refunded Whether the money has been sent back already.
 */
export function refundPromise(priceLabel: string, refunded: boolean): string {
  return refunded
    ? `We've refunded the ${priceLabel} to your original payment method. Refunds usually appear within 5–10 business days depending on your bank.`
    : `We do not keep money for a report we couldn't deliver. Our team can retry the pull, and if a retry doesn't work we refund the ${priceLabel} in full.`;
}
