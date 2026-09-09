import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Guards the report page's reading order: VIN history first, model extras last.
 */
describe("report view layout", () => {
  it("places Also for this model after every VIN history section", async () => {
    const source = await readFile(
      fileURLToPath(new URL("../src/components/report-view.tsx", import.meta.url)),
      "utf8",
    );
    const extras = source.indexOf("<ModelExtrasCard");
    const sections = source.indexOf("{sections.map((section) =>");
    assert.ok(extras > 0 && sections > 0);
    assert.ok(
      extras > sections,
      "the model card must follow the VIN history sections, not sit under What to know",
    );
    const card = await readFile(
      fileURLToPath(new URL("../src/components/model-extras.tsx", import.meta.url)),
      "utf8",
    );
    assert.match(card, /id="model-extras"/);
    assert.match(card, /Not this VIN/);
  });

  it("collapses every history section, including sales, to a short closed face", async () => {
    const source = await readFile(
      fileURLToPath(new URL("../src/components/report-view.tsx", import.meta.url)),
      "utf8",
    );
    assert.match(source, /sectionClosedTitle/);
    assert.match(source, /when-closed mt-1.5 text-sm text-slate-600/);
    assert.doesNotMatch(
      source,
      /listings && listings.length > 0 \? \(/,
      "sales chapters must not stay expanded while other sections fold",
    );
    assert.match(source, /<SectionFace section=\{section\} odometerRollback=\{odometerRollback\} \/>/);
  });

  it("gives collapsed history cards a Show-records label and a persistent chevron", async () => {
    const source = await readFile(
      fileURLToPath(new URL("../src/components/report-view.tsx", import.meta.url)),
      "utf8",
    );
    assert.match(source, /Show \{count\}/);
    assert.match(source, /when-closed mt-2 flex items-center gap-1 text-sm font-medium text-brand-600/);
    assert.match(source, /disclosure-chevron/);
  });

  it("stacks tabulated rows as cards below sm so Event and brand stay on screen", async () => {
    const source = await readFile(
      fileURLToPath(new URL("../src/components/report-view.tsx", import.meta.url)),
      "utf8",
    );
    assert.match(source, /function RecordRowCard/);
    assert.match(source, /stackedRecordRow/);
    assert.match(source, /sm:hidden print:hidden/);
    assert.match(source, /hidden overflow-x-auto[\s\S]*sm:block print:block/);
  });

  it("promotes the summary under the vehicle title when findings exist", async () => {
    const source = await readFile(
      fileURLToPath(new URL("../src/components/report-view.tsx", import.meta.url)),
      "utf8",
    );
    const h1 = source.indexOf("{vehicleTitle(report.vehicle)}");
    const promoted = source.indexOf("flags.length > 0 &&");
    const chips = source.indexOf("{chips.length > 0 &&");
    assert.ok(h1 > 0 && promoted > h1 && chips > promoted);
    assert.match(source, /border-l-4 border-amber-400/);
  });
});

describe("paid report shell", () => {
  it("does not render a second h1 or a UTC delivered stamp", async () => {
    const source = await readFile(
      fileURLToPath(new URL("../src/app/report/[token]/page.tsx", import.meta.url)),
      "utf8",
    );
    assert.doesNotMatch(source, /<h1[^>]*>\s*Your vehicle history report/);
    assert.doesNotMatch(source, /Delivered/);
    assert.doesNotMatch(source, /slice\(0, 16\)\} UTC/);
    assert.match(source, /Your report/);
    assert.match(source, /Keep this page/);
  });
});
