import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { sendReportEmail } from "@/lib/email";
import { renderReportPdf, reportPdfFilename } from "@/lib/report-pdf";
import {
  buildSampleBrief,
  buildSampleModelExtras,
  buildSampleReport,
} from "@/lib/sample-report";
import type { Order } from "@/lib/store";
import { normalizeVinAuditReport } from "@/lib/vinaudit";

const VIN = "4T1BF1FK8CU512345";

/** The path a paid order actually takes: provider payload in, PDF out. */
function paidReport() {
  return normalizeVinAuditReport(
    {
      attributes: { Year: "2012", Make: "Toyota", Model: "Camry" },
      titles: [
        { vin: VIN, date: "2024-09-27", state: "TN", meter: "121477", meterunit: "M", current: true },
        { vin: VIN, date: "2019-03-08", state: "TN", meter: "78930", meterunit: "M", current: false },
      ],
      recalls: [
        {
          campaign: "14V-651",
          component: "Air bag inflator",
          summary: "A long recall summary that has no business in a table cell.",
        },
      ],
    },
    VIN,
  );
}

function paidOrder(): Order {
  return {
    id: "ord_test",
    vin: VIN,
    email: "buyer@example.com",
    status: "fulfilled",
    accessToken: "tok_secret_do_not_print",
    amountCents: 1499,
    currency: "usd",
    createdAt: new Date().toISOString(),
    report: paidReport(),
  } as Order;
}

/** Reads the page tree's own count out of the rendered file. */
function pageCount(pdf: Buffer): number {
  const match = /\/Count (\d+)/.exec(pdf.toString("latin1"));
  assert.ok(match, "the PDF should declare how many pages it has");
  return Number(match[1]);
}

describe("report PDF", () => {
  it("names the file so a buyer can find it after forwarding", () => {
    assert.equal(reportPdfFilename("4t1bf1fk8cu512345"), `PullVinReport-${VIN}.pdf`);
    assert.equal(reportPdfFilename("4T1BF1FK8-CU512345"), `PullVinReport-${VIN}.pdf`);
  });

  it("renders a real PDF from a purchased report", async () => {
    const pdf = await renderReportPdf(paidReport());
    assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
    assert.ok(pdf.byteLength > 4_000, `suspiciously small: ${pdf.byteLength} bytes`);
  });

  it("renders the sample too, so the layout cannot rot unnoticed", async () => {
    const pdf = await renderReportPdf(buildSampleReport());
    assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
  });

  it("sets its type solid, not double-spaced", async () => {
    // In this renderer `lineHeight` is added to the line box rather than used
    // as it, so `lineHeight: 1` on 9pt text leaves roughly 18pt of leading.
    // It compounds down the page: the sample ran to four pages of half-empty
    // ones before these were removed. The font's own metrics are already right.
    const source = await readFile(
      fileURLToPath(new URL("../src/lib/report-pdf.tsx", import.meta.url)),
      "utf8",
    );
    const declarations = source
      .split("\n")
      .filter((line) => !/^\s*(\*|\/\/)/.test(line))
      .filter((line) => /lineHeight:/.test(line));
    assert.deepEqual(declarations, []);

    const pdf = await renderReportPdf(
      buildSampleReport(),
      buildSampleBrief(),
      buildSampleModelExtras(),
    );
    assert.ok(
      pageCount(pdf) <= 3,
      `the sample, brief and model extras should fit in 3 pages, got ${pageCount(pdf)}`,
    );
  });

  it("labels this-VIN brief copy separately from the model zone", async () => {
    const source = await readFile(
      fileURLToPath(new URL("../src/lib/report-pdf.tsx", import.meta.url)),
      "utf8",
    );
    assert.match(source, /FROM_THIS_VIN/);
    assert.match(source, /COMMON_FOR_MODEL/);
    assert.match(source, /MODEL_ZONE_TITLE/);
    assert.match(source, /MODEL_ZONE_NOTE/);
    assert.match(source, /reportNavItems\(report, \{\s*modelExtras: hasModelExtras\(modelExtras\),\s*\}\)/);

    const fromReport = source.indexOf("brief.fromReport");
    const questions = source.indexOf("brief.questions");
    const common = source.indexOf("brief.commonForModel");
    const extras = source.indexOf("<ModelExtrasBlock");
    const sections = source.indexOf("{sections.map((section) =>");
    assert.ok(fromReport > 0 && questions > fromReport && common > questions);
    assert.ok(extras > sections, "PDF model extras must follow VIN history sections");
    assert.match(source, /complaintSamples\(extras\.complaints\)/);
    assert.match(source, /clipPdf\(sample\.summary\)/);
    assert.match(source, /owner write-ups[\s\S]*not this VIN/);
    assert.match(source, /if \(!hasModelExtras\(extras\)\) return null/);
    assert.doesNotMatch(source, /failed to load/i);
  });

  it("omits the model zone from the PDF when extras are missing", async () => {
    const withExtras = await renderReportPdf(
      buildSampleReport(),
      buildSampleBrief(),
      buildSampleModelExtras(),
    );
    const without = await renderReportPdf(
      buildSampleReport(),
      buildSampleBrief(),
      null,
    );
    assert.ok(
      withExtras.byteLength > without.byteLength,
      "empty extras must not leave a placeholder card in the PDF",
    );
    const haystack = (pdf: Buffer) => pdf.toString("latin1");
    assert.match(haystack(withExtras), /About this model/);
    assert.doesNotMatch(haystack(without), /About this model/);
    assert.doesNotMatch(haystack(without), /failed to load/i);
  });

  it("attaches model extras to the receipt PDF so the email copy matches the page", async () => {
    const source = await readFile(
      fileURLToPath(new URL("../src/lib/email.ts", import.meta.url)),
      "utf8",
    );
    assert.match(source, /extrasForReport/);
    assert.match(source, /renderReportPdf\(\s*withCurrentLayout\(order\.report\),\s*order\.aiBrief,\s*modelExtras,/);
  });

  it("carries the written brief into the forwarded copy", async () => {
    const withBrief = await renderReportPdf(
      buildSampleReport(),
      buildSampleBrief(),
    );
    const withoutBrief = await renderReportPdf(buildSampleReport());
    assert.equal(withBrief.subarray(0, 5).toString("latin1"), "%PDF-");
    assert.ok(
      withBrief.byteLength > withoutBrief.byteLength,
      "the brief should add content, not vanish",
    );
  });
});

describe("receipt email", () => {
  it("survives a missing mail provider without throwing away the order", async () => {
    const before = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    try {
      const result = await sendReportEmail(paidOrder());
      assert.equal(result.sent, false);
      // Fulfillment reads this string; it must never look like a hard failure.
      assert.match(result.detail, /skipped/i);
    } finally {
      if (before !== undefined) process.env.RESEND_API_KEY = before;
    }
  });
});
