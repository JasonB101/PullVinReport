import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  GOOGLE_ADS_ID,
  GOOGLE_ADS_PURCHASE_CURRENCY,
  GOOGLE_ADS_PURCHASE_SEND_TO,
  GOOGLE_ADS_PURCHASE_VALUE,
  GOOGLE_ADS_SCRIPT_SRC,
  firePurchaseConversionOnce,
  purchaseConversionParams,
  purchaseConversionStorageKey,
  resetPurchaseConversionDedupeForTests,
  shouldFirePurchaseConversion,
} from "../src/lib/google-ads.ts";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));

function readSrc(relative: string) {
  return readFile(new URL(relative, `file://${SRC}`), "utf8");
}

afterEach(() => {
  resetPurchaseConversionDedupeForTests();
});

describe("Google Ads Purchase IDs", () => {
  it("uses the confirmed AW tag, send_to, and $14.99 USD", () => {
    assert.equal(GOOGLE_ADS_ID, "AW-18440939667");
    assert.equal(
      GOOGLE_ADS_PURCHASE_SEND_TO,
      "AW-18440939667/VQOrCJabp_IcEJPRqdlE",
    );
    assert.equal(GOOGLE_ADS_PURCHASE_VALUE, 14.99);
    assert.equal(GOOGLE_ADS_PURCHASE_CURRENCY, "USD");
    assert.equal(
      GOOGLE_ADS_SCRIPT_SRC,
      "https://www.googletagmanager.com/gtag/js?id=AW-18440939667",
    );
    assert.deepEqual(purchaseConversionParams(), {
      send_to: "AW-18440939667/VQOrCJabp_IcEJPRqdlE",
      value: 14.99,
      currency: "USD",
    });
  });

  it("rejects the truncated AW-1844093667 typo in Ads source", async () => {
    const files = [
      "lib/google-ads.ts",
      "lib/google-analytics.ts",
      "components/google-analytics.tsx",
      "components/google-ads-purchase.tsx",
    ];
    for (const file of files) {
      const source = await readSrc(file);
      assert.doesNotMatch(source, /AW-1844093667/, file);
    }
  });
});

describe("shouldFirePurchaseConversion", () => {
  it("fires only on a paid confirmation path", () => {
    assert.equal(
      shouldFirePurchaseConversion({ paid: true, confirmationPath: true }),
      true,
    );
  });

  it("does not fire on unpaid or non-confirmation surfaces", () => {
    assert.equal(
      shouldFirePurchaseConversion({ paid: false, confirmationPath: true }),
      false,
    );
    assert.equal(
      shouldFirePurchaseConversion({ paid: true, confirmationPath: false }),
      false,
    );
    assert.equal(
      shouldFirePurchaseConversion({ paid: false, confirmationPath: false }),
      false,
    );
  });
});

describe("firePurchaseConversionOnce", () => {
  it("sends the conversion event with the confirmed payload", () => {
    const calls: unknown[][] = [];
    const fired = firePurchaseConversionOnce({
      orderId: "ord_1",
      gtag: (...args) => {
        calls.push(args);
      },
      storage: memoryStorage(),
    });

    assert.equal(fired, true);
    assert.deepEqual(calls, [
      [
        "event",
        "conversion",
        {
          send_to: "AW-18440939667/VQOrCJabp_IcEJPRqdlE",
          value: 14.99,
          currency: "USD",
        },
      ],
    ]);
  });

  it("is idempotent for the same order when the page remounts", () => {
    const calls: unknown[][] = [];
    const gtag = (...args: unknown[]) => {
      calls.push(args);
    };
    const storage = memoryStorage();

    assert.equal(
      firePurchaseConversionOnce({ orderId: "ord_2", gtag, storage }),
      true,
    );
    assert.equal(
      firePurchaseConversionOnce({ orderId: "ord_2", gtag, storage }),
      false,
    );
    assert.equal(calls.length, 1);
    assert.equal(storage.getItem(purchaseConversionStorageKey("ord_2")), "1");
  });

  it("still dedupes after a remount that only has storage", () => {
    const storage = memoryStorage();
    const gtag = () => {
      throw new Error("should not fire");
    };
    storage.setItem(purchaseConversionStorageKey("ord_3"), "1");
    assert.equal(
      firePurchaseConversionOnce({ orderId: "ord_3", gtag, storage }),
      false,
    );
  });

  it("does not fire without an order id", () => {
    let called = false;
    assert.equal(
      firePurchaseConversionOnce({
        orderId: "   ",
        gtag: () => {
          called = true;
        },
      }),
      false,
    );
    assert.equal(called, false);
  });
});

describe("where the tag is mounted", () => {
  it("loads gtag.js on the purchase component and fires conversion on ready", async () => {
    const component = await readSrc("components/google-ads-purchase.tsx");
    assert.match(component, /GOOGLE_ADS_SCRIPT_SRC/);
    assert.match(component, /strategy="afterInteractive"/);
    assert.match(component, /onReady=\{onGtagReady\}/);
    assert.match(component, /gtag\("config", GOOGLE_ADS_ID\)/);
    assert.match(component, /firePurchaseConversionOnce/);
  });

  it("fires on the paid report confirmation banner, not every report view", async () => {
    const report = await readSrc("app/report/[token]/page.tsx");
    assert.match(report, /isNew &&/);
    assert.match(report, /<GoogleAdsPurchase orderId=\{order\.id\} \/>/);
    assert.match(report, /Payment received/);
  });

  it("fires on the paid-but-undelivered success shell, not pending or unmatched", async () => {
    const success = await readSrc("app/order/success/page.tsx");
    assert.equal(
      success.match(/<GoogleAdsPurchase/g)?.length,
      1,
      "exactly one Purchase mount — the paid-but-undelivered return",
    );
    const paidFailed = success.indexOf(
      "Your payment went through, but the report didn't",
    );
    const mount = success.indexOf("<GoogleAdsPurchase orderId={order.id} />");
    const pending = success.indexOf("Your payment is still processing");
    const unmatched = success.indexOf("We couldn't match that checkout");
    assert.ok(paidFailed > 0 && mount > paidFailed);
    assert.ok(pending > 0 && pending < mount);
    assert.ok(unmatched > 0 && unmatched < mount);
  });

  it("does not fire Purchase on landing, sample, preview, or canceled checkout", async () => {
    const surfaces = [
      "app/layout.tsx",
      "app/page.tsx",
      "app/sample/page.tsx",
      "app/is-carfax-worth-it/page.tsx",
      "app/preview/page.tsx",
      "components/checkout-panel.tsx",
      "components/sample-teaser.tsx",
    ];
    for (const file of surfaces) {
      const source = await readSrc(file);
      assert.doesNotMatch(source, /GoogleAdsPurchase|VQOrCJabp_IcEJPRqdlE/, file);
    }
  });

  it("configs the AW tag sitewide without sending the Purchase event", async () => {
    const component = await readSrc("components/google-analytics.tsx");
    const bootstrap = await readSrc("lib/google-analytics.ts");
    assert.match(component, /sitewideGtagInlineScript/);
    assert.match(bootstrap, /GOOGLE_ADS_ID/);
    assert.match(bootstrap, /gtag\('config'/);
    assert.doesNotMatch(component, /firePurchaseConversionOnce|VQOrCJabp_IcEJPRqdlE/);
    assert.doesNotMatch(bootstrap, /firePurchaseConversionOnce/);
    assert.doesNotMatch(bootstrap, /VQOrCJabp_IcEJPRqdlE/);
  });
});

function memoryStorage(): {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
} {
  const map = new Map<string, string>();
  return {
    getItem(key) {
      return map.get(key) ?? null;
    },
    setItem(key, value) {
      map.set(key, value);
    },
  };
}
