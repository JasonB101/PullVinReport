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
});
