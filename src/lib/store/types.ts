import type { VehicleBrief } from "@/lib/ai-brief";
import type { VehicleReport } from "@/lib/report";

export type OrderStatus =
  /** Checkout session created, payment not confirmed yet. */
  | "pending"
  /** Stripe confirmed payment; the VinAudit pull has not finished. */
  | "paid"
  /** Report retrieved and available to the customer. */
  | "fulfilled"
  /** Paid but the provider could not deliver — needs a retry or refund. */
  | "failed"
  /** Checkout abandoned or expired. */
  | "expired";

export type Order = {
  id: string;
  createdAt: string;
  updatedAt: string;
  vin: string;
  email: string;
  status: OrderStatus;
  amountCents: number;
  currency: string;
  /** Unguessable token that gates access to the report page. */
  accessToken: string;
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
  report: VehicleReport | null;
  providerError: string | null;
  /** Cached buyer brief, written once so reopening the report costs nothing. */
  aiBrief: VehicleBrief | null;
  aiBriefGeneratedAt: string | null;
  fulfilledAt: string | null;
  emailSentAt: string | null;
  /** Set once the charge has been sent back to the customer. */
  refundedAt: string | null;
  stripeRefundId: string | null;
};

export type NewOrder = {
  vin: string;
  email: string;
  amountCents: number;
  currency: string;
};

export type OrderPatch = Partial<
  Pick<
    Order,
    | "status"
    | "email"
    | "stripeSessionId"
    | "stripePaymentIntentId"
    | "report"
    | "providerError"
    | "aiBrief"
    | "aiBriefGeneratedAt"
    | "fulfilledAt"
    | "emailSentAt"
    | "refundedAt"
    | "stripeRefundId"
  >
>;

/** Illustrated vehicle hero, cached by year/make/model/trim/color. */
export type VehicleHeroRecord = {
  cacheKey: string;
  src: string;
  contentType: string;
  model: string;
  createdAt: string;
};

export type OrderStats = {
  total: number;
  pending: number;
  fulfilled: number;
  failed: number;
  /** Money taken and kept — refunded orders are excluded. */
  revenueCents: number;
  refundedCents: number;
};

export interface OrderStore {
  readonly kind: "postgres" | "file";
  /** Human-readable description of where data is going, shown on /status. */
  readonly description: string;
  init(): Promise<void>;
  create(input: NewOrder): Promise<Order>;
  getById(id: string): Promise<Order | null>;
  getByAccessToken(token: string): Promise<Order | null>;
  getByStripeSessionId(sessionId: string): Promise<Order | null>;
  getByStripePaymentIntentId(paymentIntentId: string): Promise<Order | null>;
  update(id: string, patch: OrderPatch): Promise<Order>;
  list(limit?: number): Promise<Order[]>;
  stats(): Promise<OrderStats>;
  ping(): Promise<{ ok: boolean; detail: string }>;
  /** Illustrated hero, keyed by year/make/model/trim/color — not by VIN. */
  getVehicleHero(cacheKey: string): Promise<VehicleHeroRecord | null>;
  saveVehicleHero(hero: VehicleHeroRecord): Promise<void>;
  /** Drop cached drawings whose key does not start with `keepPrefix`. */
  clearStaleVehicleHeroes(keepPrefix: string): Promise<number>;
  /**
   * Public model extras (NHTSA / EPA), keyed by year/make/model — not by
   * order or VIN. Payload is the already-summarised slice.
   */
  getModelExtras(cacheKey: string): Promise<ModelExtrasRecord | null>;
  saveModelExtras(record: ModelExtrasRecord): Promise<void>;
};

/** Cached NHTSA/EPA slice for one year/make/model. */
export type ModelExtrasRecord = {
  cacheKey: string;
  payload: unknown;
  fetchedAt: string;
};
