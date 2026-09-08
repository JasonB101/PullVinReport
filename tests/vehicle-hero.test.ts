import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { normalizeVinAuditReport } from "@/lib/vinaudit";
import {
  generateVehicleHero,
  heroAlt,
  heroFacts,
  heroPrompt,
  HERO_CACHE_VERSION,
  HERO_LABEL,
} from "../src/lib/vehicle-hero.ts";
import { buildSampleReport } from "../src/lib/sample-report.ts";
import { fal, isFalConfigured } from "../src/lib/config.ts";

const VIN = "4S3BWGN65M3012307";

const realKey = process.env.FAL_KEY;
const realModel = process.env.FAL_IMAGE_MODEL;

afterEach(() => {
  if (realKey === undefined) delete process.env.FAL_KEY;
  else process.env.FAL_KEY = realKey;
  if (realModel === undefined) delete process.env.FAL_IMAGE_MODEL;
  else process.env.FAL_IMAGE_MODEL = realModel;
});

describe("hero facts", () => {
  it("prefers a richer listing trim and an exterior colour from the sales rows", () => {
    const report = normalizeVinAuditReport(
      {
        attributes: {
          Year: "2021",
          Make: "Subaru",
          Model: "Outback",
          Trim: "Limited",
          BodyClass: "Wagon",
        },
        sales: [
          {
            date: "2024-05-12",
            listing_type: "Dealer classified",
            listingprice: "27995",
            trim: "Limited XT",
            exterior_color: "Magnetite Gray Metallic",
            city: "Appleton",
            state: "WI",
          },
          {
            date: "2024-05-13",
            listing_type: "Online marketplace",
            listingprice: "27995",
            exterior_color: "Magnetite Gray",
            city: "Appleton",
            state: "WI",
          },
        ],
      },
      VIN,
    );

    const facts = heroFacts(report);
    assert.ok(facts);
    assert.equal(facts.year, "2021");
    assert.equal(facts.make, "Subaru");
    assert.equal(facts.model, "Outback");
    assert.equal(facts.trim, "Limited XT");
    assert.equal(facts.color, "Magnetite Gray Metallic");
    assert.match(facts.cacheKey, new RegExp(`^${HERO_CACHE_VERSION}\\|`));
    assert.match(facts.cacheKey, /2021\|subaru\|outback\|limited xt\|magnetite gray metallic/);
    assert.doesNotMatch(facts.cacheKey, new RegExp(VIN, "i"));
  });

  it("reads Vehicle color / Vehicle colour on sales records, not only Exterior color", () => {
    const report = normalizeVinAuditReport(
      {
        attributes: { Year: "2021", Make: "Subaru", Model: "Outback", Trim: "Limited" },
        sales: [
          {
            date: "2024-05-12",
            listing_type: "Dealer classified",
            vehicle_color: "Magnetite Gray",
            interior_color: "Ivory",
            city: "Appleton",
            state: "WI",
          },
        ],
      },
      VIN,
    );

    const labeled = report.sections
      .flatMap((section) => section.records.flat())
      .map((field) => field.label);
    assert.ok(
      labeled.some((label) => /^vehicle colou?r$/i.test(label)),
      `expected a Vehicle color field, got ${labeled.join(", ")}`,
    );

    const facts = heroFacts(report);
    assert.ok(facts);
    assert.equal(facts.color, "Magnetite Gray");
    assert.doesNotMatch(facts.color, /ivory/i);
  });

  it("reads the sample as year, make, model, SE trim and Super White", () => {
    const facts = heroFacts(buildSampleReport());
    assert.ok(facts);
    assert.equal(facts.trim, "SE");
    assert.equal(facts.color, "Super White");
    assert.match(facts.bodyStyle, /Sedan/i);
    assert.match(facts.engine, /2\.5L L4/);
  });
});

describe("the illustration prompt", () => {
  it("asks for a cutout in the exact colour and forbids a photograph of this VIN", () => {
    const facts = heroFacts(buildSampleReport());
    assert.ok(facts);
    const prompt = heroPrompt(facts);
    assert.match(prompt, /2012 Toyota Camry SE/);
    assert.match(prompt, /Super White/);
    assert.match(prompt, /Exact exterior colour/);
    assert.match(prompt, /Three-quarter/);
    assert.match(prompt, /Transparent background/i);
    assert.match(prompt, /2\.5L L4/);
    assert.doesNotMatch(prompt, new RegExp(buildSampleReport().vin, "i"));
    assert.match(heroAlt(facts), /not a photo of this VIN/i);
    assert.match(HERO_LABEL, /Illustration/);
    assert.match(HERO_LABEL, /not this VIN/i);
  });
});

describe("generating a hero", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function mockFal(handlers: {
    draw?: () => Response;
    cut?: () => Response;
    onCall?: (url: string, init?: RequestInit) => void;
  }) {
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const href = String(url);
      handlers.onCall?.(href, init);
      if (href.includes("rembg") || href.includes("background")) {
        return (
          handlers.cut?.() ??
          new Response(
            JSON.stringify({
              image: { url: "data:image/png;base64,ZmFrZQ==", content_type: "image/png" },
            }),
            { status: 200 },
          )
        );
      }
      return (
        handlers.draw?.() ??
        new Response(
          JSON.stringify({
            images: [{ url: "https://fal.media/drawn.webp", content_type: "image/webp" }],
          }),
          { status: 200 },
        )
      );
    }) as unknown as typeof fetch;
  }

  it("does nothing at all without a key", async () => {
    delete process.env.FAL_KEY;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response("{}");
    }) as typeof fetch;

    assert.equal(isFalConfigured(), false);
    assert.equal(await generateVehicleHero(buildSampleReport()), null);
    assert.equal(called, false);
  });

  it("sends the illustration prompt, then cuts the background, and never the VIN", async () => {
    process.env.FAL_KEY = "test-fal-key";
    process.env.FAL_IMAGE_MODEL = "fal-ai/recraft/v3/text-to-image";
    const calls: { url: string; body: unknown }[] = [];

    mockFal({
      onCall(url, init) {
        calls.push({
          url,
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
      },
    });

    const hero = await generateVehicleHero(buildSampleReport());
    assert.ok(hero);
    assert.match(hero.src, /^data:image\/png;base64,/);
    assert.match(hero.cacheKey, new RegExp(`^${HERO_CACHE_VERSION}\\|`));
    assert.match(hero.cacheKey, /2012\|toyota\|camry/);

    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /\/fal-ai\/recraft\/v3\/text-to-image$/);
    assert.match(calls[1].url, /\/fal-ai\/imageutils\/rembg$/);

    const drawn = calls[0].body as Record<string, string>;
    assert.equal(drawn.style, "digital_illustration");
    assert.equal(drawn.image_size, "landscape_4_3");
    assert.match(drawn.prompt, /2012 Toyota Camry SE/);
    assert.match(drawn.prompt, /Exact exterior colour: Super White/);
    assert.match(drawn.prompt, /Transparent background/);
    assert.doesNotMatch(JSON.stringify(calls), new RegExp(buildSampleReport().vin, "i"));
    assert.doesNotMatch(JSON.stringify(calls), /test-fal-key/);

    const cut = calls[1].body as Record<string, unknown>;
    assert.equal(cut.image_url, "https://fal.media/drawn.webp");
    assert.equal(cut.crop_to_bbox, true);
    assert.equal(fal.model, "fal-ai/recraft/v3/text-to-image");
    assert.equal(fal.rembgModel, "fal-ai/imageutils/rembg");
  });

  it("gives up quietly when fal errors", async () => {
    process.env.FAL_KEY = "test-fal-key";
    globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
    assert.equal(await generateVehicleHero(buildSampleReport()), null);
  });

  it("does not keep an opaque studio plate when the cutout pass fails", async () => {
    process.env.FAL_KEY = "test-fal-key";
    mockFal({
      cut: () => new Response("nope", { status: 500 }),
    });
    assert.equal(await generateVehicleHero(buildSampleReport()), null);
  });
});
