import { isFalConfigured } from "@/lib/config";
import type { VehicleReport } from "@/lib/report";
import { withCurrentLayout } from "@/lib/report-layout";
import { getStore } from "@/lib/store";
import type { Order, OrderStore, VehicleHeroRecord } from "@/lib/store";
import {
  generateVehicleHeroFromFacts,
  HERO_CACHE_VERSION,
  heroFacts,
  heroFamilyPrefix,
  type HeroFacts,
} from "@/lib/vehicle-hero";

export type HeroOutcome =
  | { status: "ready"; hero: VehicleHeroRecord; cached: boolean }
  | { status: "unavailable"; reason: string };

const inflight = new Map<string, Promise<HeroOutcome>>();

async function peekCachedHero(
  facts: HeroFacts,
  store: OrderStore,
): Promise<VehicleHeroRecord | null> {
  try {
    await store.init();
    const exact = await store.getVehicleHero(facts.cacheKey);
    if (exact) return exact;
    return await store.findVehicleHeroByPrefix(heroFamilyPrefix(facts));
  } catch (error) {
    console.error(`[hero] could not read the cache for ${facts.cacheKey}`, error);
    return null;
  }
}

/**
 * A cached drawing only. Never starts a generate — PDF render and a first
 * page view must not block on fal. Missing key, empty cache or a read
 * error all become `null`.
 *
 * Exact year/make/model/trim/color wins. If that misses (typical after a
 * pre-pay generate that had no paint), reuse any drawing in the same
 * year/make/model family so checkout does not bill fal a second time.
 */
export async function cachedHeroForFacts(
  facts: HeroFacts,
  store: OrderStore = getStore(),
): Promise<VehicleHeroRecord | null> {
  return peekCachedHero(facts, store);
}

export async function cachedHeroForReport(
  report: VehicleReport,
  store: OrderStore = getStore(),
): Promise<VehicleHeroRecord | null> {
  const facts = heroFacts(withCurrentLayout(report));
  if (!facts) return null;
  return peekCachedHero(facts, store);
}

async function drawAndCache(
  facts: HeroFacts,
  store: OrderStore,
): Promise<HeroOutcome> {
  try {
    await store.clearStaleVehicleHeroes(`${HERO_CACHE_VERSION}|`);
  } catch (error) {
    console.error("[hero] could not drop stale cached drawings", error);
  }

  const cached = await peekCachedHero(facts, store);
  if (cached) return { status: "ready", hero: cached, cached: true };

  if (!isFalConfigured()) {
    return { status: "unavailable", reason: "FAL_KEY is not set" };
  }

  const hero = await generateVehicleHeroFromFacts(facts);
  if (!hero) {
    return { status: "unavailable", reason: "the illustration could not be drawn" };
  }

  try {
    await store.saveVehicleHero(hero);
  } catch (error) {
    console.error(`[hero] could not cache the illustration for ${facts.cacheKey}`, error);
  }

  return { status: "ready", hero, cached: false };
}

/**
 * Draw (or reuse) an illustrated hero from year/make/model facts.
 *
 * Concurrent callers for the same family share one fal trip. The VIN is
 * never part of the key — another buyer of the same example reuses it.
 */
export async function heroForFacts(
  facts: HeroFacts,
  store: OrderStore = getStore(),
): Promise<HeroOutcome> {
  const family = heroFamilyPrefix(facts);
  const pending = inflight.get(family);
  if (pending) return pending;

  const work = drawAndCache(facts, store).finally(() => {
    inflight.delete(family);
  });
  inflight.set(family, work);
  return work;
}

/**
 * The order's illustrated hero, generated once per year/make/model/trim/color.
 *
 * Cached on the store by that key — not by VIN — so another order for the
 * same example reuses the drawing. A page view never blocks on this; missing
 * key or a failed call leave the report as it was.
 */
export async function heroForOrder(order: Order): Promise<HeroOutcome> {
  if (!order.report) {
    return { status: "unavailable", reason: "this order has no report yet" };
  }

  const facts = heroFacts(withCurrentLayout(order.report));
  if (!facts) {
    return { status: "unavailable", reason: "the report does not name a vehicle" };
  }

  return heroForFacts(facts);
}
