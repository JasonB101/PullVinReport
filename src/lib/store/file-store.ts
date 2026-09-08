import { randomUUID, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  NewOrder,
  Order,
  OrderPatch,
  OrderStats,
  OrderStore,
  VehicleHeroRecord,
} from "@/lib/store/types";

/**
 * JSON-file order store used when DATABASE_URL is not set.
 *
 * Intended for local development and the hosted demo. Serverless filesystems
 * are ephemeral, so production deployments should always set DATABASE_URL.
 */
export class FileOrderStore implements OrderStore {
  readonly kind = "file" as const;

  private readonly dir: string;
  private readonly file: string;
  private readonly heroesFile: string;
  /** Serializes read-modify-write cycles so concurrent updates don't clobber. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(dir = process.env.DATA_DIR?.trim() || ".data") {
    // The directory is configuration, not a build-time constant, so opt out of
    // the bundler's filesystem tracing rather than pulling the repo into the
    // serverless bundle.
    this.dir = path.resolve(/* turbopackIgnore: true */ process.cwd(), dir);
    this.file = path.join(this.dir, "orders.json");
    this.heroesFile = path.join(this.dir, "vehicle-heroes.json");
  }

  get description(): string {
    return `JSON file at ${path.relative(process.cwd(), this.file) || this.file} (demo only — not durable on serverless hosts)`;
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    try {
      await readFile(this.file, "utf8");
    } catch {
      await writeFile(this.file, "[]", "utf8");
    }
  }

  private async readAll(): Promise<Order[]> {
    try {
      const raw = await readFile(this.file, "utf8");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as Order[]) : [];
    } catch {
      return [];
    }
  }

  private async writeAll(orders: Order[]): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const tmp = `${this.file}.${randomBytes(4).toString("hex")}.tmp`;
    await writeFile(tmp, JSON.stringify(orders, null, 2), "utf8");
    await rename(tmp, this.file);
  }

  private run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => undefined);
    return next;
  }

  async create(input: NewOrder): Promise<Order> {
    const now = new Date().toISOString();
    const order: Order = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      vin: input.vin,
      email: input.email,
      status: "pending",
      amountCents: input.amountCents,
      currency: input.currency,
      accessToken: randomBytes(24).toString("base64url"),
      stripeSessionId: null,
      stripePaymentIntentId: null,
      report: null,
      providerError: null,
      aiBrief: null,
      aiBriefGeneratedAt: null,
      fulfilledAt: null,
      emailSentAt: null,
      refundedAt: null,
      stripeRefundId: null,
    };
    return this.run(async () => {
      const orders = await this.readAll();
      orders.unshift(order);
      await this.writeAll(orders);
      return order;
    });
  }

  async getById(id: string): Promise<Order | null> {
    const orders = await this.readAll();
    return orders.find((order) => order.id === id) ?? null;
  }

  async getByAccessToken(token: string): Promise<Order | null> {
    const orders = await this.readAll();
    return orders.find((order) => order.accessToken === token) ?? null;
  }

  async getByStripeSessionId(sessionId: string): Promise<Order | null> {
    const orders = await this.readAll();
    return orders.find((order) => order.stripeSessionId === sessionId) ?? null;
  }

  async getByStripePaymentIntentId(
    paymentIntentId: string,
  ): Promise<Order | null> {
    const orders = await this.readAll();
    return (
      orders.find((order) => order.stripePaymentIntentId === paymentIntentId) ??
      null
    );
  }

  async update(id: string, patch: OrderPatch): Promise<Order> {
    return this.run(async () => {
      const orders = await this.readAll();
      const index = orders.findIndex((order) => order.id === id);
      if (index === -1) throw new Error(`Order ${id} not found`);
      const updated: Order = {
        ...orders[index],
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      orders[index] = updated;
      await this.writeAll(orders);
      return updated;
    });
  }

  async list(limit = 100): Promise<Order[]> {
    const orders = await this.readAll();
    return [...orders]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async stats(): Promise<OrderStats> {
    const orders = await this.readAll();
    // Money actually taken, which includes paid orders the provider later
    // failed to fulfil — those are refund candidates, not phantom revenue.
    const charged = orders.filter(
      (o) =>
        o.status === "fulfilled" ||
        o.status === "paid" ||
        (o.status === "failed" && Boolean(o.stripePaymentIntentId)),
    );
    return {
      total: orders.length,
      pending: orders.filter((o) => o.status === "pending" || o.status === "paid")
        .length,
      fulfilled: orders.filter((o) => o.status === "fulfilled").length,
      failed: orders.filter((o) => o.status === "failed").length,
      revenueCents: charged
        .filter((o) => !o.refundedAt)
        .reduce((sum, o) => sum + o.amountCents, 0),
      refundedCents: orders
        .filter((o) => Boolean(o.refundedAt))
        .reduce((sum, o) => sum + o.amountCents, 0),
    };
  }

  private async readHeroes(): Promise<Record<string, VehicleHeroRecord>> {
    try {
      const parsed = JSON.parse(await readFile(this.heroesFile, "utf8"));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, VehicleHeroRecord>)
        : {};
    } catch {
      return {};
    }
  }

  async getVehicleHero(cacheKey: string): Promise<VehicleHeroRecord | null> {
    const heroes = await this.readHeroes();
    return heroes[cacheKey] ?? null;
  }

  async saveVehicleHero(hero: VehicleHeroRecord): Promise<void> {
    await this.run(async () => {
      const heroes = await this.readHeroes();
      heroes[hero.cacheKey] = hero;
      await this.writeHeroes(heroes);
    });
  }

  async clearStaleVehicleHeroes(keepPrefix: string): Promise<number> {
    return this.run(async () => {
      const heroes = await this.readHeroes();
      const next: Record<string, VehicleHeroRecord> = {};
      let removed = 0;
      for (const [key, hero] of Object.entries(heroes)) {
        if (key.startsWith(keepPrefix)) next[key] = hero;
        else removed += 1;
      }
      if (removed > 0) await this.writeHeroes(next);
      return removed;
    });
  }

  private async writeHeroes(heroes: Record<string, VehicleHeroRecord>): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const tmp = `${this.heroesFile}.${randomBytes(4).toString("hex")}.tmp`;
    await writeFile(tmp, JSON.stringify(heroes), "utf8");
    await rename(tmp, this.heroesFile);
  }

  async ping(): Promise<{ ok: boolean; detail: string }> {
    try {
      await this.init();
      const orders = await this.readAll();
      return {
        ok: true,
        detail: `File store readable, ${orders.length} order${orders.length === 1 ? "" : "s"} stored`,
      };
    } catch (error) {
      return { ok: false, detail: (error as Error).message };
    }
  }
}
