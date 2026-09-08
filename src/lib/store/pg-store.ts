import { randomBytes } from "node:crypto";

import { Pool } from "pg";

import type { VehicleBrief } from "@/lib/ai-brief";
import { databaseUrl } from "@/lib/config";
import type { VehicleReport } from "@/lib/report";
import type {
  NewOrder,
  Order,
  OrderPatch,
  OrderStats,
  OrderStore,
  VehicleHeroRecord,
} from "@/lib/store/types";

const TABLE = "pullvinreport_orders";
const HEROES = "pullvinreport_vehicle_heroes";

type Row = {
  id: string;
  created_at: Date | string;
  updated_at: Date | string;
  vin: string;
  email: string;
  status: Order["status"];
  amount_cents: number | string;
  currency: string;
  access_token: string;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  report: unknown;
  provider_error: string | null;
  ai_brief: unknown;
  ai_brief_generated_at: Date | string | null;
  fulfilled_at: Date | string | null;
  email_sent_at: Date | string | null;
  refunded_at: Date | string | null;
  stripe_refund_id: string | null;
};

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toOrder(row: Row): Order {
  return {
    id: row.id,
    createdAt: iso(row.created_at) as string,
    updatedAt: iso(row.updated_at) as string,
    vin: row.vin,
    email: row.email,
    status: row.status,
    amountCents: Number(row.amount_cents),
    currency: row.currency,
    accessToken: row.access_token,
    stripeSessionId: row.stripe_session_id,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    report: (row.report as VehicleReport | null) ?? null,
    providerError: row.provider_error,
    aiBrief: (row.ai_brief as VehicleBrief | null) ?? null,
    aiBriefGeneratedAt: iso(row.ai_brief_generated_at),
    fulfilledAt: iso(row.fulfilled_at),
    emailSentAt: iso(row.email_sent_at),
    refundedAt: iso(row.refunded_at),
    stripeRefundId: row.stripe_refund_id,
  };
}

const PATCH_COLUMNS: Record<keyof OrderPatch, string> = {
  status: "status",
  email: "email",
  stripeSessionId: "stripe_session_id",
  stripePaymentIntentId: "stripe_payment_intent_id",
  report: "report",
  providerError: "provider_error",
  aiBrief: "ai_brief",
  aiBriefGeneratedAt: "ai_brief_generated_at",
  fulfilledAt: "fulfilled_at",
  emailSentAt: "email_sent_at",
  refundedAt: "refunded_at",
  stripeRefundId: "stripe_refund_id",
};

export class PostgresOrderStore implements OrderStore {
  readonly kind = "postgres" as const;
  readonly description = "PostgreSQL (DATABASE_URL)";

  private pool: Pool | null = null;
  private ready: Promise<void> | null = null;

  private getPool(): Pool {
    if (!this.pool) {
      const connectionString = databaseUrl();
      if (!connectionString) {
        throw new Error("DATABASE_URL is not set");
      }
      const requiresSsl =
        process.env.DATABASE_SSL === "true" ||
        /sslmode=require/.test(connectionString) ||
        /\.neon\.tech|\.supabase\.co|\.render\.com/.test(connectionString);
      this.pool = new Pool({
        connectionString,
        max: Number(process.env.DATABASE_POOL_MAX ?? 5),
        ssl: requiresSsl ? { rejectUnauthorized: false } : undefined,
      });
    }
    return this.pool;
  }

  init(): Promise<void> {
    if (!this.ready) {
      this.ready = (async () => {
        await this.getPool().query(`
          CREATE TABLE IF NOT EXISTS ${TABLE} (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            vin TEXT NOT NULL,
            email TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            amount_cents INTEGER NOT NULL,
            currency TEXT NOT NULL DEFAULT 'usd',
            access_token TEXT NOT NULL UNIQUE,
            stripe_session_id TEXT UNIQUE,
            stripe_payment_intent_id TEXT,
            report JSONB,
            provider_error TEXT,
            fulfilled_at TIMESTAMPTZ,
            email_sent_at TIMESTAMPTZ,
            refunded_at TIMESTAMPTZ,
            stripe_refund_id TEXT,
            ai_brief JSONB,
            ai_brief_generated_at TIMESTAMPTZ
          );
        `);
        // Tables created before refunds and the buyer brief need the columns.
        await this.getPool().query(`
          ALTER TABLE ${TABLE}
            ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS stripe_refund_id TEXT,
            ADD COLUMN IF NOT EXISTS ai_brief JSONB,
            ADD COLUMN IF NOT EXISTS ai_brief_generated_at TIMESTAMPTZ;
        `);
        await this.getPool().query(
          `CREATE INDEX IF NOT EXISTS ${TABLE}_created_at_idx ON ${TABLE} (created_at DESC);`,
        );
        await this.getPool().query(`
          CREATE TABLE IF NOT EXISTS ${HEROES} (
            cache_key TEXT PRIMARY KEY,
            src TEXT NOT NULL,
            content_type TEXT NOT NULL,
            model TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
          );
        `);
      })().catch((error) => {
        this.ready = null;
        throw error;
      });
    }
    return this.ready;
  }

  private async query<T extends Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
  ) {
    await this.init();
    return this.getPool().query<T>(text, values);
  }

  async create(input: NewOrder): Promise<Order> {
    const result = await this.query<Row>(
      `INSERT INTO ${TABLE} (vin, email, amount_cents, currency, access_token)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.vin,
        input.email,
        input.amountCents,
        input.currency,
        randomBytes(24).toString("base64url"),
      ],
    );
    return toOrder(result.rows[0]);
  }

  async getById(id: string): Promise<Order | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const result = await this.query<Row>(`SELECT * FROM ${TABLE} WHERE id = $1`, [id]);
    return result.rows[0] ? toOrder(result.rows[0]) : null;
  }

  async getByAccessToken(token: string): Promise<Order | null> {
    const result = await this.query<Row>(
      `SELECT * FROM ${TABLE} WHERE access_token = $1`,
      [token],
    );
    return result.rows[0] ? toOrder(result.rows[0]) : null;
  }

  async getByStripeSessionId(sessionId: string): Promise<Order | null> {
    const result = await this.query<Row>(
      `SELECT * FROM ${TABLE} WHERE stripe_session_id = $1`,
      [sessionId],
    );
    return result.rows[0] ? toOrder(result.rows[0]) : null;
  }

  async getByStripePaymentIntentId(
    paymentIntentId: string,
  ): Promise<Order | null> {
    const result = await this.query<Row>(
      `SELECT * FROM ${TABLE} WHERE stripe_payment_intent_id = $1`,
      [paymentIntentId],
    );
    return result.rows[0] ? toOrder(result.rows[0]) : null;
  }

  async update(id: string, patch: OrderPatch): Promise<Order> {
    const assignments: string[] = ["updated_at = now()"];
    const values: unknown[] = [];

    for (const [key, column] of Object.entries(PATCH_COLUMNS) as [
      keyof OrderPatch,
      string,
    ][]) {
      if (!(key in patch)) continue;
      const value = patch[key];
      const jsonColumn = key === "report" || key === "aiBrief";
      values.push(jsonColumn ? (value ? JSON.stringify(value) : null) : value);
      assignments.push(`${column} = $${values.length}`);
    }

    values.push(id);
    const result = await this.query<Row>(
      `UPDATE ${TABLE} SET ${assignments.join(", ")} WHERE id = $${values.length} RETURNING *`,
      values,
    );
    if (!result.rows[0]) throw new Error(`Order ${id} not found`);
    return toOrder(result.rows[0]);
  }

  async list(limit = 100): Promise<Order[]> {
    const result = await this.query<Row>(
      `SELECT * FROM ${TABLE} ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return result.rows.map(toOrder);
  }

  async stats(): Promise<OrderStats> {
    const result = await this.query<Record<string, string>>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE status IN ('pending','paid'))::text AS pending,
         COUNT(*) FILTER (WHERE status = 'fulfilled')::text AS fulfilled,
         COUNT(*) FILTER (WHERE status = 'failed')::text AS failed,
         COALESCE(SUM(amount_cents) FILTER (
           WHERE refunded_at IS NULL
             AND (status IN ('paid','fulfilled')
              OR (status = 'failed' AND stripe_payment_intent_id IS NOT NULL))
         ), 0)::text AS revenue,
         COALESCE(SUM(amount_cents) FILTER (WHERE refunded_at IS NOT NULL), 0)::text AS refunded
       FROM ${TABLE}`,
    );
    const row = result.rows[0] ?? {};
    return {
      total: Number(row.total ?? 0),
      pending: Number(row.pending ?? 0),
      fulfilled: Number(row.fulfilled ?? 0),
      failed: Number(row.failed ?? 0),
      revenueCents: Number(row.revenue ?? 0),
      refundedCents: Number(row.refunded ?? 0),
    };
  }

  async getVehicleHero(cacheKey: string): Promise<VehicleHeroRecord | null> {
    const result = await this.query<{
      cache_key: string;
      src: string;
      content_type: string;
      model: string;
      created_at: Date | string;
    }>(`SELECT * FROM ${HEROES} WHERE cache_key = $1`, [cacheKey]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      cacheKey: row.cache_key,
      src: row.src,
      contentType: row.content_type,
      model: row.model,
      createdAt: iso(row.created_at) as string,
    };
  }

  async saveVehicleHero(hero: VehicleHeroRecord): Promise<void> {
    await this.query(
      `INSERT INTO ${HEROES} (cache_key, src, content_type, model, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (cache_key) DO NOTHING`,
      [hero.cacheKey, hero.src, hero.contentType, hero.model, hero.createdAt],
    );
  }

  async ping(): Promise<{ ok: boolean; detail: string }> {
    try {
      await this.query("SELECT 1");
      return { ok: true, detail: "Connected, orders table ready" };
    } catch (error) {
      return { ok: false, detail: (error as Error).message };
    }
  }
}
