import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  NHTSA_STAR_MAX,
  STAR_PATH,
  nhtsaStarLabel,
  nhtsaStarScore,
  nhtsaStarSlots,
} from "@/lib/safety-stars";

describe("NHTSA star glyphs", () => {
  it("fills left-to-right from a 1–5 NHTSA rating and never invents extras", () => {
    assert.equal(NHTSA_STAR_MAX, 5);
    assert.match(STAR_PATH, /^M12 /);
    assert.deepEqual(nhtsaStarSlots(5), [true, true, true, true, true]);
    assert.deepEqual(nhtsaStarSlots(4), [true, true, true, true, false]);
    assert.deepEqual(nhtsaStarSlots(1), [true, false, false, false, false]);
    assert.deepEqual(nhtsaStarSlots(0), [false, false, false, false, false]);
    assert.deepEqual(nhtsaStarSlots(9), [true, true, true, true, true]);
    assert.equal(nhtsaStarScore(5), "5/5");
    assert.equal(nhtsaStarScore(4), "4/5");
    assert.equal(nhtsaStarLabel("Overall", 5), "Overall 5 out of 5 stars");
    assert.equal(nhtsaStarLabel("Front", 4), "Front 4 out of 5 stars");
  });
});
