import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { normalizeVinAuditReport } from "@/lib/vinaudit";
import {
  generateVehicleHero,
  heroAlt,
  heroFacts,
  heroPrompt,
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
    assert.match(facts.cacheKey, /2021\|subaru\|outback\|limited xt\|magnetite gray metallic/);
    assert.doesNotMatch(facts.cacheKey, new RegExp(VIN, "i"));
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
  it("asks for a cartoon and forbids a photograph of this VIN", () => {
    const facts = heroFacts(buildSampleReport());
    assert.ok(facts);
    const prompt = heroPrompt(facts);
    assert.match(prompt, /2012 Toyota Camry SE/);
    assert.match(prompt, /Super White/);
    assert.match(prompt, /2\.5L L4/);
    assert.match(prompt, /cartoon|cel-shaded|vector/i);
    assert.match(prompt, /not a photograph|no photorealism|no photograph/i);
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

  it("sends the illustration prompt and never the VIN or the key", async () => {
    process.env.FAL_KEY = "test-fal-key";
    process.env.FAL_IMAGE_MODEL = "fal-ai/recraft/v3/text-to-image";
    let request: { url: string; init: RequestInit } | null = null;

    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      request = { url: String(url), init: init ?? {} };
      return new Response(
        JSON.stringify({
          images: [{ url: "data:image/jpeg;base64,ZmFrZQ==", content_type: "image/jpeg" }],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const hero = await generateVehicleHero(buildSampleReport());
    assert.ok(hero);
    assert.match(hero.src, /^data:image\/jpeg;base64,/);
    assert.match(hero.cacheKey, /2012\|toyota\|camry/);

    assert.ok(request);
    const sent = request as { url: string; init: RequestInit };
    assert.match(sent.url, /\/fal-ai\/recraft\/v3\/text-to-image$/);
    assert.equal(
      (sent.init.headers as Record<string, string>).authorization,
      "Key test-fal-key",
    );

    const body = JSON.parse(String(sent.init.body));
    assert.equal(body.style, "digital_illustration");
    assert.equal(body.image_size, "landscape_4_3");
    assert.match(body.prompt, /2012 Toyota Camry SE/);
    assert.match(body.prompt, /2\.5L L4/);
    assert.doesNotMatch(String(sent.init.body), new RegExp(buildSampleReport().vin, "i"));
    assert.doesNotMatch(String(sent.init.body), /test-fal-key/);
    assert.equal(fal.model, "fal-ai/recraft/v3/text-to-image");
  });

  it("gives up quietly when fal errors", async () => {
    process.env.FAL_KEY = "test-fal-key";
    globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
    assert.equal(await generateVehicleHero(buildSampleReport()), null);
  });
});
