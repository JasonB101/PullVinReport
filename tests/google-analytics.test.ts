import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { GOOGLE_ADS_SCRIPT_SRC } from "../src/lib/google-ads.ts";
import {
  gaMeasurementId,
  gaScriptSrc,
  sitewideGtagInlineScript,
  sitewideGtagScriptSrc,
} from "../src/lib/google-analytics.ts";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));
const ROOT = fileURLToPath(new URL("../", import.meta.url));

function readSrc(relative: string) {
  return readFile(new URL(relative, `file://${SRC}`), "utf8");
}

function readRoot(relative: string) {
  return readFile(new URL(relative, `file://${ROOT}`), "utf8");
}

const ENV_KEY = "NEXT_PUBLIC_GA_MEASUREMENT_ID";

afterEach(() => {
  delete process.env[ENV_KEY];
});

describe("gaMeasurementId", () => {
  it("returns a trimmed G- id from NEXT_PUBLIC_GA_MEASUREMENT_ID", () => {
    process.env[ENV_KEY] = "  G-E2Z25ZEBVF  ";
    assert.equal(gaMeasurementId(), "G-E2Z25ZEBVF");
    assert.equal(
      gaScriptSrc("G-E2Z25ZEBVF"),
      "https://www.googletagmanager.com/gtag/js?id=G-E2Z25ZEBVF",
    );
  });

  it("omits the script when the env is unset, blank, or not a G- id", () => {
    assert.equal(gaMeasurementId(undefined), undefined);
    assert.equal(gaMeasurementId(""), undefined);
    assert.equal(gaMeasurementId("   "), undefined);
    assert.equal(gaMeasurementId("AW-18440939667"), undefined);
    assert.equal(gaMeasurementId("GTM-XXXX"), undefined);
    assert.equal(gaMeasurementId("not-an-id"), undefined);
    delete process.env[ENV_KEY];
    assert.equal(gaMeasurementId(), undefined);
    process.env[ENV_KEY] = "";
    assert.equal(gaMeasurementId(), undefined);
  });
});

describe("sitewide gtag bootstrap", () => {
  it("always configs AW-18440939667 and adds GA4 when a G- id is set", () => {
    const withGa = sitewideGtagInlineScript("G-E2Z25ZEBVF");
    assert.match(withGa, /gtag\('config', "G-E2Z25ZEBVF"\)/);
    assert.match(withGa, /gtag\('config', "AW-18440939667"\)/);
    assert.doesNotMatch(withGa, /VQOrCJabp_IcEJPRqdlE/);
    assert.doesNotMatch(withGa, /['"]conversion['"]/);
    assert.doesNotMatch(withGa, /pullvinreport/i);

    const adsOnly = sitewideGtagInlineScript(undefined);
    assert.doesNotMatch(adsOnly, /gtag\('config', "G-/);
    assert.match(adsOnly, /gtag\('config', "AW-18440939667"\)/);
    assert.doesNotMatch(adsOnly, /VQOrCJabp_IcEJPRqdlE|pullvinreport/i);

    assert.equal(
      sitewideGtagScriptSrc("G-E2Z25ZEBVF"),
      "https://www.googletagmanager.com/gtag/js?id=G-E2Z25ZEBVF",
    );
    assert.equal(sitewideGtagScriptSrc(undefined), GOOGLE_ADS_SCRIPT_SRC);
  });
});

describe("where GA4 is mounted", () => {
  it("loads gtag.js from the root layout via Script afterInteractive", async () => {
    const layout = await readSrc("app/layout.tsx");
    const component = await readSrc("components/google-analytics.tsx");
    assert.match(layout, /<GoogleAnalytics \/>/);
    assert.doesNotMatch(layout, /G-E2Z25ZEBVF|AW-18440939667|GTM-/);
    assert.match(component, /strategy="afterInteractive"/);
    assert.match(component, /sitewideGtagScriptSrc\(measurementId\)/);
    assert.match(component, /sitewideGtagInlineScript\(measurementId\)/);
    assert.match(component, /NEXT_PUBLIC_GA_MEASUREMENT_ID|gaMeasurementId/);
    assert.doesNotMatch(component, /G-E2Z25ZEBVF/);
    assert.doesNotMatch(component, /GTM-|VQOrCJabp_IcEJPRqdlE/);
  });

  it("does not hardcode a measurement ID in source", async () => {
    const files = [
      "app/layout.tsx",
      "components/google-analytics.tsx",
      "lib/google-analytics.ts",
    ];
    for (const file of files) {
      const source = await readSrc(file);
      assert.doesNotMatch(source, /G-E2Z25ZEBVF/, file);
    }
  });

  it("documents the env var in .env.example without requiring it", async () => {
    const example = await readRoot(".env.example");
    assert.match(
      example,
      /# Sitewide GA4 \(gtag\)\. Set to a G- id \(e\.g\. G-E2Z25ZEBVF\) to load; leave empty to omit the GA4 config\./,
    );
    assert.match(example, /AW-18440939667 is always configured on the same sitewide gtag/);
    assert.match(example, /NEXT_PUBLIC_GA_MEASUREMENT_ID=""/);
    assert.doesNotMatch(example, /pullvinreport\.com.*gtag|gtag.*pullvinreport\.com/i);
  });
});

describe("Google Ads Purchase stays on the success path only", () => {
  it("does not change the Ads Purchase component or IDs", async () => {
    const ads = await readSrc("lib/google-ads.ts");
    const purchase = await readSrc("components/google-ads-purchase.tsx");
    assert.match(ads, /export const GOOGLE_ADS_ID = "AW-18440939667"/);
    assert.match(
      ads,
      /export const GOOGLE_ADS_PURCHASE_SEND_TO =\n  "AW-18440939667\/VQOrCJabp_IcEJPRqdlE"/,
    );
    assert.match(purchase, /GOOGLE_ADS_SCRIPT_SRC/);
    assert.match(purchase, /firePurchaseConversionOnce/);
    assert.match(purchase, /gtag\("config", GOOGLE_ADS_ID\)/);
    assert.doesNotMatch(purchase, /NEXT_PUBLIC_GA_MEASUREMENT_ID|GoogleAnalytics/);
    assert.doesNotMatch(ads, /NEXT_PUBLIC_GA_MEASUREMENT_ID|GoogleAnalytics/);
  });
});
