import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkDigitMatches,
  maskVin,
  modelYearFromVin,
  normalizeVin,
  prettyVin,
  validateVin,
} from "../src/lib/vin.ts";

const VALID_VIN = "1HGCM82633A004352";

describe("normalizeVin", () => {
  it("uppercases and strips spaces and dashes", () => {
    assert.equal(normalizeVin(" 1hgcm826-33a 004352 "), VALID_VIN);
  });
});

describe("checkDigitMatches", () => {
  it("accepts a VIN with a correct check digit", () => {
    assert.equal(checkDigitMatches(VALID_VIN), true);
  });

  it("rejects a VIN whose check digit was altered", () => {
    assert.equal(checkDigitMatches("1HGCM82693A004352"), false);
  });
});

describe("validateVin", () => {
  it("accepts a well-formed VIN", () => {
    const result = validateVin(VALID_VIN);
    assert.equal(result.valid, true);
    assert.equal(result.warning, undefined);
    assert.equal(result.vin, VALID_VIN);
  });

  it("requires a value", () => {
    assert.equal(validateVin("").valid, false);
  });

  it("requires exactly 17 characters", () => {
    const result = validateVin("1HGCM82633A00435");
    assert.equal(result.valid, false);
    assert.match(result.error ?? "", /17 characters/);
  });

  it("rejects the letters I, O and Q", () => {
    const result = validateVin("1HGCM8I633A004352");
    assert.equal(result.valid, false);
    assert.match(result.error ?? "", /I, O or Q/);
  });

  it("rejects punctuation", () => {
    assert.equal(validateVin("1HGCM8*633A004352").valid, false);
  });

  it("warns but still accepts a bad check digit", () => {
    const result = validateVin("1HGCM82693A004352");
    assert.equal(result.valid, true);
    assert.match(result.warning ?? "", /check digit/);
  });
});

describe("modelYearFromVin", () => {
  it("decodes the 10th character to a plausible model year", () => {
    // "3" in position 10 maps to 2003 on the current cycle.
    assert.equal(modelYearFromVin(VALID_VIN), 2003);
  });

  it("returns undefined for a malformed VIN", () => {
    assert.equal(modelYearFromVin("TOO-SHORT"), undefined);
  });
});

describe("display helpers", () => {
  it("groups a VIN for readability", () => {
    assert.equal(prettyVin(VALID_VIN), "1HG CM826 3 3A004352");
  });

  it("masks all but the last six characters", () => {
    assert.equal(maskVin(VALID_VIN), "•••••••••••004352");
  });
});
