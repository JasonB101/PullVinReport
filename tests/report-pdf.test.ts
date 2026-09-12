import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

import { BRAND } from "@/lib/config";
import { sendReportEmail } from "@/lib/email";
import { currentEvent, sectionLead, sectionTable } from "@/lib/report";
import { renderReportPdf, reportPdfFilename } from "@/lib/report-pdf";
import { renderStoredReportPdf } from "@/lib/report-pdf-serve";
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

/** Visible text from a react-pdf buffer (hex TJ runs in Flate streams). */
function pdfVisibleText(pdf: Buffer): string {
  const latin1 = pdf.toString("latin1");
  const chunks: string[] = [];
  const header = /\/Length (\d+)\n\/Filter \/FlateDecode\n>>\nstream\n/g;
  for (const match of latin1.matchAll(header)) {
    const start = match.index + match[0].length;
    const raw = pdf.subarray(start, start + Number(match[1]));
    let decoded: string;
    try {
      decoded = inflateSync(raw).toString("latin1");
    } catch {
      continue;
    }
    for (const hex of decoded.match(/<([0-9A-Fa-f]+)>/g) ?? []) {
      chunks.push(Buffer.from(hex.slice(1, -1), "hex").toString("latin1"));
    }
  }
  return chunks.join("");
}

describe("report PDF", () => {
  it("names the file so a buyer can find it after forwarding", () => {
    assert.equal(reportPdfFilename("4t1bf1fk8cu512345"), `${BRAND.filePrefix}-${VIN}.pdf`);
    assert.equal(reportPdfFilename("4T1BF1FK8-CU512345"), `${BRAND.filePrefix}-${VIN}.pdf`);
    assert.equal(
      reportPdfFilename("4t1bf1fk8cu512345", true),
      `${BRAND.filePrefix}-SAMPLE-${VIN}.pdf`,
    );
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

    const pdf = await renderStoredReportPdf(
      buildSampleReport(),
      buildSampleBrief(),
      buildSampleModelExtras(),
    );
    assert.ok(
      pageCount(pdf) <= 4,
      `the sample, brief, model extras, MPG figures and hero should fit in 4 pages, got ${pageCount(pdf)}`,
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
    assert.match(source, /mpgFigureRows/);
    assert.match(source, /EPA_MPG_TITLE/);
    assert.match(source, /EPA_MPG_NOTE/);
    assert.match(source, /modelExtrasCountsLine/);
    assert.match(source, /VIN_SPECS_TITLE/);
    assert.match(source, /VIN_SPECS_NOTE/);
    assert.match(source, /THIS_VIN_CHIP/);
    assert.match(source, /partitionSpecMpg/);
    assert.match(source, /groupSpecFields/);
    assert.match(source, /specMeasureFigures/);
    assert.match(source, /function SpecGroupPdf/);
    assert.match(source, /function PdfSpecIcon/);
    assert.match(source, /specIconPaths/);
    assert.match(source, /<PdfSpecIcon name=\{group\.key\}/);
    assert.match(source, /function SpecMpgFigures/);
    assert.doesNotMatch(
      source,
      /No data/,
      "PDF must not print VinAudit No data placeholders",
    );
    assert.match(source, /SPEC_MPG_TITLE/);
    assert.match(source, /SPEC_MPG_NOTE/);
    assert.match(source, /function EpaMpgFigures/);
    assert.match(source, /SAFETY_RATINGS_TITLE/);
    assert.match(source, /function SafetyRatingsBlock/);
    assert.match(source, /function PdfStar/);
    assert.match(source, /STAR_PATH/);
    assert.match(source, /nhtsaStarSlots/);
    assert.match(source, /safetyOverallFigure/);
    assert.match(source, /NHTSA_STAR_MAX/);
    assert.doesNotMatch(
      source,
      /\{row\.label\} stars/,
      "PDF must print SVG stars, not a 'label stars' caption",
    );
    assert.match(source, /EPA_OWNERSHIP_TITLE/);
    assert.match(source, /function OwnershipBlock/);
    assert.match(source, /function EvBlock/);
    assert.match(source, /hasEvCard\(extras\.ev\)/);
    assert.match(source, /recallHeaderBadges/);
    assert.match(source, /campaignBadges/);
    assert.doesNotMatch(
      source,
      /modelExtrasSummaryLine/,
      "PDF MPG must print as figures, not the jammed summary line",
    );
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
    assert.doesNotMatch(without.toString("latin1"), /failed to load/i);
  });

  it("attaches model extras to the receipt PDF so the email copy matches the page", async () => {
    const source = await readFile(
      fileURLToPath(new URL("../src/lib/email.ts", import.meta.url)),
      "utf8",
    );
    assert.match(source, /extrasForReport\(withCurrentLayout\(order\.report\)/);
    assert.match(source, /renderOrderReportPdf\(order, modelExtras\)/);
  });

  it("loads paid HTML and PDF extras through extrasForReport, not a cache peek", async () => {
    const html = await readFile(
      fileURLToPath(new URL("../src/app/report/[token]/page.tsx", import.meta.url)),
      "utf8",
    );
    const pdf = await readFile(
      fileURLToPath(new URL("../src/lib/report-pdf-serve.ts", import.meta.url)),
      "utf8",
    );
    const api = await readFile(
      fileURLToPath(new URL("../src/app/api/model-extras/route.ts", import.meta.url)),
      "utf8",
    );
    assert.match(html, /extrasForReport\(report, store\)/);
    assert.doesNotMatch(html, /cachedExtrasForReport/);
    assert.match(pdf, /extrasForReport\(\s*withCurrentLayout\(order\.report\)/);
    assert.match(api, /extrasForReport\(withCurrentLayout\(order\.report\)/);
  });

  it("embeds a cached hero beside the vehicle card and labels it an illustration", async () => {
    const source = await readFile(
      fileURLToPath(new URL("../src/lib/report-pdf.tsx", import.meta.url)),
      "utf8",
    );
    assert.match(source, /HERO_ILLUSTRATION_LABEL/);
    assert.match(source, /<VehicleHeroPdf src=\{heroSrc\}/);
    assert.match(source, /heroSrc \? <VehicleHeroPdf/);
    assert.match(source, /hero embed failed — rendering without it/);
    assert.doesNotMatch(source, /photograph of this VIN/i);
    assert.doesNotMatch(source, /generateVehicleHero/);

    const pixel =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const withHero = await renderReportPdf(buildSampleReport(), null, null, pixel);
    const without = await renderReportPdf(buildSampleReport());
    assert.equal(withHero.subarray(0, 5).toString("latin1"), "%PDF-");
    assert.ok(
      withHero.byteLength > without.byteLength,
      "a cached hero must add image bytes, not vanish",
    );
    assert.match(withHero.toString("latin1"), /\/Subtype\s*\/Image/);
  });

  it("still renders when the hero bytes are unreadable", async () => {
    const pdf = await renderReportPdf(
      buildSampleReport(),
      null,
      null,
      "not-an-embeddable-image",
    );
    assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
    assert.ok(pdf.byteLength > 4_000);
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

  it("prints a shared State chip when every title agrees, and keeps State on rows when they differ", async () => {
    // HTML SharedFields and the PDF shared note are the same contract: a value
    // that never varies is stated once for the section, not copied down the
    // table. Forcing it back onto every PDF row would break that lockstep.
    const html = await readFile(
      fileURLToPath(new URL("../src/components/report-view.tsx", import.meta.url)),
      "utf8",
    );
    const pdfSource = await readFile(
      fileURLToPath(new URL("../src/lib/report-pdf.tsx", import.meta.url)),
      "utf8",
    );
    assert.match(html, /function SharedFields/);
    assert.match(html, /Same on all \{count\} records/);
    assert.match(html, /section\.shared && section\.shared\.length > 0/);
    assert.match(pdfSource, /Same on all \{section\.records\.length\} records/);
    assert.match(pdfSource, /fieldList\(section\.shared\)/);

    const sameState = normalizeVinAuditReport(
      {
        attributes: { Year: "2012", Make: "Ford", Model: "F-150" },
        titles: [
          { vin: VIN, date: "2024-09-27", state: "OK", meter: "121477", meterunit: "M", current: true },
          { vin: VIN, date: "2023-06-01", state: "OK", meter: "98000", meterunit: "M", current: false },
          { vin: VIN, date: "2022-04-11", state: "OK", meter: "81000", meterunit: "M", current: false },
          { vin: VIN, date: "2021-03-08", state: "OK", meter: "72000", meterunit: "M", current: false },
          { vin: VIN, date: "2019-08-19", state: "OK", meter: "51000", meterunit: "M", current: false },
          { vin: VIN, date: "2017-01-15", state: "OK", meter: "33000", meterunit: "M", current: false },
        ],
      },
      VIN,
    );
    const sameTitles = sameState.sections.find((section) => section.key === "titles");
    assert.ok(sameTitles);
    assert.deepEqual(sameTitles.shared, [{ label: "State", value: "OK" }]);
    const sameTable = sectionTable(sameTitles);
    assert.ok(sameTable);
    assert.equal(sameTable.columns.includes("State"), false);
    assert.deepEqual(sameTable.rows[0].cells, ["Sep 27, 2024", "121,477 mi", "Yes"]);
    assert.deepEqual(currentEvent(sameTitles), {
      label: "Current title",
      fields: [
        { label: "Date", value: "Sep 27, 2024" },
        { label: "Mileage", value: "121,477 mi" },
      ],
    });
    assert.equal(sectionLead(sameTitles)?.text, "Sep 27, 2024 · 121,477 mi");

    const samePdf = pdfVisibleText(await renderReportPdf(sameState));
    assert.match(samePdf, /Same on all 6 records/);
    assert.match(samePdf, /State: OK/);
    assert.match(samePdf, /Current title: Sep 27, 2024 {2}· {2}121,477 mi/);
    assert.doesNotMatch(samePdf, /DATE\s*STATE\s*MILEAGE/);

    const mixed = normalizeVinAuditReport(
      {
        attributes: { Year: "2012", Make: "Toyota", Model: "Camry" },
        titles: [
          { vin: VIN, date: "2024-09-27", state: "TN", meter: "121477", meterunit: "M", current: true },
          { vin: VIN, date: "2015-06-19", state: "KY", meter: "41204", meterunit: "M", current: false },
        ],
      },
      VIN,
    );
    const mixedTitles = mixed.sections.find((section) => section.key === "titles");
    assert.ok(mixedTitles);
    assert.equal(
      mixedTitles.shared?.some((field) => field.label === "State"),
      false,
    );
    const mixedTable = sectionTable(mixedTitles);
    assert.ok(mixedTable);
    assert.deepEqual(mixedTable.columns, ["Date", "State", "Mileage", "Current"]);
    assert.deepEqual(mixedTable.rows[0].cells, ["Sep 27, 2024", "TN", "121,477 mi", "Yes"]);
    assert.equal(sectionLead(mixedTitles)?.text, "Sep 27, 2024 · TN · 121,477 mi");

    const mixedPdf = pdfVisibleText(await renderReportPdf(mixed));
    assert.doesNotMatch(mixedPdf, /Same on all \d+ records — State:/);
    assert.match(mixedPdf, /DATESTATEMILEAGECURRENT/);
    assert.match(mixedPdf, /Sep 27, 2024TN121,477 miYes/);
    assert.match(mixedPdf, /Jun 19, 2015KY41,204 miNo/);

    const sampleTitles = buildSampleReport().sections.find(
      (section) => section.key === "titles",
    );
    assert.ok(sampleTitles);
    assert.deepEqual(
      sampleTitles.records.map(
        (record) => record.find((field) => field.label === "State")?.value,
      ),
      ["TN", "TN", "TN", "KY", "KY"],
    );
    assert.equal(
      sampleTitles.shared?.some((field) => field.label === "State"),
      false,
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
