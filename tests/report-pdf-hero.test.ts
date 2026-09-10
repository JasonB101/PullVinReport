import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { cachedHeroForReport } from "@/lib/order-hero";
import {
  embeddableHeroSrc,
  heroSrcForPdf,
  SAMPLE_HERO_SVG,
  sampleHeroDataUri,
} from "@/lib/report-pdf-hero";
import { buildSampleReport } from "@/lib/sample-report";
import { FileOrderStore } from "@/lib/store/file-store";
import { HERO_ILLUSTRATION_LABEL, heroFacts, SAMPLE_HERO_SRC } from "@/lib/vehicle-hero";
import { normalizeVinAuditReport } from "@/lib/vinaudit";

const VIN = "4T1BF1FK8CU512345";
const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function paidReport() {
  return normalizeVinAuditReport(
    {
      attributes: { Year: "2012", Make: "Toyota", Model: "Camry" },
      titles: [
        {
          vin: VIN,
          date: "2024-09-27",
          state: "TN",
          meter: "121477",
          meterunit: "M",
          current: true,
        },
      ],
    },
    VIN,
  );
}

describe("the PDF illustration label", () => {
  it("calls the picture an illustration and not this VIN", () => {
    assert.match(HERO_ILLUSTRATION_LABEL, /illustration/i);
    assert.match(HERO_ILLUSTRATION_LABEL, /not this VIN/i);
    assert.doesNotMatch(HERO_ILLUSTRATION_LABEL, /photograph of this VIN/i);
    assert.doesNotMatch(HERO_ILLUSTRATION_LABEL, /actual vehicle|this VIN's/i);
  });
});

describe("embeddable hero src", () => {
  it("keeps PNG and SVG data URIs and drops remote or webp drawings", () => {
    assert.equal(embeddableHeroSrc(PIXEL), PIXEL);
    assert.equal(
      embeddableHeroSrc("data:image/svg+xml;base64,PHN2Zz4="),
      "data:image/svg+xml;base64,PHN2Zz4=",
    );
    assert.equal(embeddableHeroSrc("https://fal.media/drawn.png"), null);
    assert.equal(embeddableHeroSrc("data:image/webp;base64,AAAA"), null);
    assert.equal(embeddableHeroSrc("data:image/png;base64,not-a-real-png"), null);
    assert.equal(embeddableHeroSrc(""), null);
    assert.equal(embeddableHeroSrc(null), null);
  });
});

describe("sample hero for the PDF", () => {
  it("stays in lockstep with the SVG the page serves", async () => {
    const file = await readFile(
      fileURLToPath(new URL("../public/sample-vehicle-hero.svg", import.meta.url)),
      "utf8",
    );
    assert.equal(file.trim(), SAMPLE_HERO_SVG.trim());
    assert.equal(path.basename(SAMPLE_HERO_SRC), "sample-vehicle-hero.svg");

    const uri = await sampleHeroDataUri();
    assert.match(uri, /^data:image\/svg\+xml;base64,/);
    const decoded = Buffer.from(
      uri.replace(/^data:image\/svg\+xml;base64,/, ""),
      "base64",
    )
      .toString("utf8")
      .trim();
    assert.match(decoded, /<svg width="136" height="52"/);
    assert.equal(decoded.replace('<svg width="136" height="52"', "<svg"), file.trim());
  });

  it("always returns the sample drawing for a sample report", async () => {
    const src = await heroSrcForPdf(buildSampleReport());
    assert.ok(src);
    assert.match(src, /^data:image\/svg\+xml;base64,/);
  });
});

describe("cached hero for the PDF", () => {
  let dataDir = "";

  before(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), "pvr-pdf-hero-"));
  });

  after(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it("reads the store cache and never asks fal to draw", async () => {
    const store = new FileOrderStore(dataDir);
    await store.init();
    const report = paidReport();
    const facts = heroFacts(report);
    assert.ok(facts);

    assert.equal(await heroSrcForPdf(report, store), null);
    assert.equal(await cachedHeroForReport(report, store), null);

    await store.saveVehicleHero({
      cacheKey: facts.cacheKey,
      src: PIXEL,
      contentType: "image/png",
      model: "test",
      createdAt: new Date().toISOString(),
    });

    assert.deepEqual(await cachedHeroForReport(report, store), await store.getVehicleHero(facts.cacheKey));
    assert.equal(await heroSrcForPdf(report, store), PIXEL);
  });

  it("skips a cached remote URL rather than fetching it at render time", async () => {
    const store = new FileOrderStore(dataDir);
    await store.init();
    const report = normalizeVinAuditReport(
      {
        attributes: { Year: "1999", Make: "Honda", Model: "Civic" },
        titles: [
          {
            vin: VIN,
            date: "2024-09-27",
            state: "TN",
            meter: "121477",
            meterunit: "M",
            current: true,
          },
        ],
      },
      VIN,
    );
    const facts = heroFacts(report);
    assert.ok(facts);
    assert.match(facts.cacheKey, /1999\|honda\|civic/);
    await store.saveVehicleHero({
      cacheKey: facts.cacheKey,
      src: "https://fal.media/too-large.png",
      contentType: "image/png",
      model: "test",
      createdAt: new Date().toISOString(),
    });
    assert.equal(await heroSrcForPdf(report, store), null);
  });
});
