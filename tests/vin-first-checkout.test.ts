import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));

function readSrc(relative: string) {
  return readFile(new URL(relative, `file://${SRC}`), "utf8");
}

describe("VIN-first checkout", () => {
  it("homepage primary CTA is VIN entry, with only soft $14.99 nearby", async () => {
    const home = await readSrc("app/page.tsx");
    const form = await readSrc("components/vin-form.tsx");

    assert.match(home, /Enter the VIN first/);
    assert.match(home, /Reports \{price\} · one-time/);
    assert.match(home, /See the vehicle/);
    assert.match(home, /Enter my VIN/);
    assert.doesNotMatch(home, /submitLabel=\{`Get my report · \$\{price\}`\}/);
    assert.doesNotMatch(home, /Get a report · \{price\}/);
    assert.doesNotMatch(home, /One VIN\. One \{price\} report/);

    assert.match(form, /submitLabel = "Check this VIN"/);
    assert.match(form, /We'll identify the vehicle next/);
  });

  it("keeps $14.99 honest on FAQ, footer, and the pay step", async () => {
    const home = await readSrc("app/page.tsx");
    const footer = await readSrc("components/site-footer.tsx");
    const checkout = await readSrc("components/checkout-panel.tsx");
    const preview = await readSrc("app/preview/page.tsx");

    assert.match(
      home,
      /One payment of \$\{formatPrice\(\)\} buys one report for one VIN/,
    );
    assert.match(footer, /formatPrice\(\)/);
    assert.match(footer, /then one \{formatPrice\(\)\} report/);
    assert.match(checkout, /Step 2 of 2 · Pay \{priceLabel\}/);
    assert.match(checkout, /Get the report"\} · \$\{priceLabel\}/);
    assert.match(preview, /priceLabel=\{formatPrice\(\)\}/);
  });

  it("preview identifies the vehicle before presenting checkout", async () => {
    const preview = await readSrc("app/preview/page.tsx");
    const decode = await readSrc("components/vin-decode-card.tsx");

    const identityAt = preview.indexOf("<VinDecodeCard");
    const checkoutAt = preview.indexOf("<CheckoutPanel");
    assert.ok(identityAt > 0, "preview must render VinDecodeCard");
    assert.ok(checkoutAt > identityAt, "checkout must follow vehicle identity");

    assert.match(preview, /Your vehicle/);
    assert.doesNotMatch(preview, /Step 1 of 2 · Confirm/);
    assert.match(decode, /Step 1 of 2 · Your vehicle/);
    assert.match(decode, /decode\.label/);
    assert.match(decode, /prettyVin\(vin\)/);
  });

  it("does not generate a paid hero or colour before checkout", async () => {
    const decode = await readSrc("components/vin-decode-card.tsx");
    const preview = await readSrc("app/preview/page.tsx");

    assert.doesNotMatch(decode, /heroForOrder|generateVehicleHero|\/api\/vehicle-hero/);
    assert.doesNotMatch(preview, /heroForOrder|generateVehicleHero|VehicleHero/);
    assert.match(
      decode,
      /Colour and the illustrated hero arrive only on the paid report/,
    );
  });

  it("leaves Google Ads Purchase and GA4 wiring intact", async () => {
    const ads = await readSrc("lib/google-ads.ts");
    const purchase = await readSrc("components/google-ads-purchase.tsx");
    const success = await readSrc("app/order/success/page.tsx");
    const layout = await readSrc("app/layout.tsx");
    const ga = await readSrc("lib/google-analytics.ts");

    assert.match(ads, /AW-1844093667/);
    assert.match(purchase, /GOOGLE_ADS_ID/);
    assert.match(success, /<GoogleAdsPurchase orderId=\{order\.id\} \/>/);
    assert.match(layout, /<GoogleAnalytics \/>/);
    assert.match(ga, /NEXT_PUBLIC_GA_MEASUREMENT_ID/);
  });
});
