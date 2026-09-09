import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Guards the report page's reading order: VIN history first, model extras last.
 */
describe("report view layout", () => {
  it("places the model zone after every VIN history section and fences it", async () => {
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
    assert.match(source, /border-t-2 border-dashed border-amber-300/);
    assert.match(source, /MODEL_ZONE_TITLE/);
    assert.match(source, /THIS_VIN_CHIP/);

    const card = await readFile(
      fileURLToPath(new URL("../src/components/model-extras.tsx", import.meta.url)),
      "utf8",
    );
    assert.match(card, /id="model-extras"/);
    assert.match(card, /NOT_THIS_VIN_CHIP/);
    assert.match(card, /border-dashed border-amber-300/);
    assert.match(card, /Also for this model/);
  });

  it("keeps VIN brief bullets and model notes in separate labelled lists", async () => {
    const source = await readFile(
      fileURLToPath(new URL("../src/components/ai-brief.tsx", import.meta.url)),
      "utf8",
    );
    assert.match(source, /FROM_THIS_VIN/);
    assert.match(source, /THIS_VIN_CHIP/);
    assert.match(source, /COMMON_FOR_MODEL/);
    assert.match(source, /NOT_THIS_VIN_CHIP/);
    assert.match(source, /QUESTIONS_HEADING/);

    const fromReport = source.indexOf("brief.fromReport");
    const questions = source.indexOf("brief.questions");
    const common = source.indexOf("brief.commonForModel");
    assert.ok(fromReport > 0 && questions > fromReport && common > questions);

    assert.doesNotMatch(
      source,
      /\[\s*\.\.\.brief\.fromReport[\s\S]*commonForModel/,
      "VIN and model bullets must not share one list",
    );
    assert.match(source, /border-dashed border-amber-300/);
    assert.match(source, /not findings on this VIN/);
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

  it("builds the header spec line and Vehicle specifications from headerSpecifications", async () => {
    const source = await readFile(
      fileURLToPath(new URL("../src/components/report-view.tsx", import.meta.url)),
      "utf8",
    );
    assert.match(source, /headerSpecifications\(report\)/);
    assert.match(source, /headerSpecSummary\(specList\)/);
    assert.match(source, /<HeaderSpecs specifications=\{specList\} \/>/);
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
