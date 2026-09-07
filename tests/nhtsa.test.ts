import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseVpicRow } from "@/lib/nhtsa";

/** Trimmed from a live `DecodeVinValues` response, placeholders included. */
const ROW = {
  BodyClass: "Sedan/Saloon",
  BusType: "Not Applicable",
  DisplacementL: "2.5",
  Doors: "4",
  EngineCylinders: "4",
  EngineModel: "2AR-FE",
  ErrorCode: "0",
  FuelTypePrimary: "Gasoline",
  Make: "TOYOTA",
  Model: "Camry",
  ModelYear: "2012",
  PlantCountry: "UNITED STATES (USA)",
  Series: "ASV50L/GSV50L/AVV50L",
  Trim: "",
  VIN: "4T1BF1FK8CU512345",
};

describe("vPIC decoding", () => {
  it("reads the year, make and model a buyer needs to recognise the car", () => {
    const decode = parseVpicRow(ROW, "4t1bf1fk8cu512345");
    assert.ok(decode);
    assert.equal(decode.label, "2012 Toyota Camry");
    assert.equal(decode.vin, "4T1BF1FK8CU512345");
  });

  it("stops vPIC shouting the make back at the customer", () => {
    const decode = parseVpicRow(ROW, ROW.VIN);
    assert.equal(decode?.vehicle.make, "Toyota");
    assert.equal(decode?.vehicle.madeIn, "United States");
  });

  it("summarises the details worth showing next to the label", () => {
    const decode = parseVpicRow(ROW, ROW.VIN);
    assert.deepEqual(decode?.details, [
      { label: "Body", value: "Sedan/Saloon" },
      { label: "Doors", value: "4" },
      { label: "Engine", value: "2.5L 4-cyl" },
      { label: "Fuel", value: "Gasoline" },
      { label: "Assembled in", value: "United States" },
    ]);
  });

  it("treats vPIC's placeholder values as no answer", () => {
    const decode = parseVpicRow(
      { ...ROW, BodyClass: "Not Applicable", FuelTypePrimary: "" },
      ROW.VIN,
    );
    assert.equal(decode?.vehicle.bodyStyle, undefined);
    assert.equal(
      decode?.details.some((detail) => detail.label === "Body"),
      false,
    );
  });

  it("declines a half-decode rather than showing a mystery vehicle", () => {
    assert.equal(parseVpicRow({ ...ROW, Model: "" }, ROW.VIN), null);
    assert.equal(parseVpicRow({ ...ROW, Make: "" }, ROW.VIN), null);
    assert.equal(parseVpicRow({}, ROW.VIN), null);
  });

  it("still decodes when only the year is missing", () => {
    const decode = parseVpicRow({ ...ROW, ModelYear: "" }, ROW.VIN);
    assert.equal(decode?.label, "Toyota Camry");
  });
});
