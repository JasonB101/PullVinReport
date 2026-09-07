import type { VehicleReport } from "@/lib/report";

/**
 * The sample report shown before checkout.
 *
 * This is static, fictional data. It exists so shoppers know exactly what they
 * are buying. It is tagged `source: "sample"` / `isSample: true` and every
 * renderer keys its SAMPLE watermark off those flags, so it can never be shown
 * in place of a purchased report.
 */
export const SAMPLE_VIN = "4T1BF1FK8CU512345";

export const SAMPLE_VEHICLE_LABEL = "2012 Toyota Camry SE";

export function buildSampleReport(): VehicleReport {
  return {
    vin: SAMPLE_VIN,
    source: "sample",
    isSample: true,
    generatedAt: "2026-01-14T15:04:00.000Z",
    vehicle: {
      year: "2012",
      make: "Toyota",
      model: "Camry",
      trim: "SE",
      bodyStyle: "4 Door Sedan",
      engine: "2.5L L4 DOHC 16V",
      transmission: "6-Speed Automatic",
      drivetrain: "FWD",
      fuelType: "Gasoline",
      madeIn: "United States",
    },
    headline:
      "No salvage, junk or insurance-loss brand was reported for this sample VIN.",
    specifications: [
      { label: "Year", value: "2012" },
      { label: "Make", value: "Toyota" },
      { label: "Model", value: "Camry" },
      { label: "Trim", value: "SE" },
      { label: "Style", value: "4 Door Sedan" },
      { label: "Engine", value: "2.5L L4 DOHC 16V" },
      { label: "Transmission", value: "6-Speed Automatic" },
      { label: "Drive type", value: "Front Wheel Drive" },
      { label: "Fuel type", value: "Gasoline" },
      { label: "Standard seating", value: "5" },
      { label: "Made in", value: "Georgetown, Kentucky, United States" },
      { label: "Anti-brake system", value: "4-Wheel ABS" },
    ],
    checks: [
      {
        key: "titles",
        label: "Title records",
        status: "found",
        count: 4,
        detail: "4 title records across 2 states",
      },
      {
        key: "branded",
        label: "Branded title",
        status: "clear",
        count: 0,
        detail: "No salvage, junk or insurance brand found",
      },
      {
        key: "accidents",
        label: "Accident records",
        status: "found",
        count: 1,
        detail: "1 minor damage record reported",
      },
      {
        key: "thefts",
        label: "Theft records",
        status: "clear",
        count: 0,
        detail: "No active theft record",
      },
      {
        key: "liens",
        label: "Liens & repossessions",
        status: "found",
        count: 1,
        detail: "1 lien reported, shown as released",
      },
      {
        key: "impounds",
        label: "Impounds",
        status: "clear",
        count: 0,
        detail: "No impound record",
      },
      {
        key: "exports",
        label: "Export records",
        status: "clear",
        count: 0,
        detail: "No export record",
      },
      {
        key: "recalls",
        label: "Open recalls",
        status: "found",
        count: 1,
        detail: "1 recall campaign listed",
      },
    ],
    odometer: [
      { date: "2012-04-02", value: 12, unit: "mi", source: "KY" },
      { date: "2015-06-19", value: 41_204, unit: "mi", source: "KY" },
      { date: "2019-03-08", value: 78_930, unit: "mi", source: "TN" },
      { date: "2024-09-27", value: 121_477, unit: "mi", source: "TN" },
    ],
    sections: [
      {
        key: "titles",
        title: "Title & registration history",
        description:
          "Every title and registration event the provider has on file, as reported by the issuing state.",
        emptyLabel: "No title or registration events were returned for this VIN.",
        records: [
          [
            { label: "Date", value: "2024-09-27" },
            { label: "State", value: "TN" },
            { label: "Odometer", value: "121,477 mi" },
            { label: "Status", value: "Current title" },
            { label: "Vehicle use", value: "Personal" },
          ],
          [
            { label: "Date", value: "2019-03-08" },
            { label: "State", value: "TN" },
            { label: "Odometer", value: "78,930 mi" },
            { label: "Status", value: "Title transferred" },
            { label: "Vehicle use", value: "Personal" },
          ],
          [
            { label: "Date", value: "2015-06-19" },
            { label: "State", value: "KY" },
            { label: "Odometer", value: "41,204 mi" },
            { label: "Status", value: "Title transferred" },
            { label: "Vehicle use", value: "Personal" },
          ],
          [
            { label: "Date", value: "2012-04-02" },
            { label: "State", value: "KY" },
            { label: "Odometer", value: "12 mi" },
            { label: "Status", value: "First title issued" },
            { label: "Vehicle use", value: "Personal" },
          ],
        ],
      },
      {
        key: "jsi",
        title: "Junk, salvage & insurance records",
        description:
          "NMVTIS junk, salvage and total-loss entries reported by insurers, recyclers and salvage yards.",
        emptyLabel: "No junk, salvage or insurance-loss records were returned.",
        records: [],
      },
      {
        key: "accidents",
        title: "Accident & damage records",
        description: "Reported collision and damage events.",
        emptyLabel: "No accident or damage records were returned.",
        records: [
          [
            { label: "Date", value: "2018-11-02" },
            { label: "Severity", value: "Minor" },
            { label: "Damage area", value: "Rear bumper" },
            { label: "Airbags deployed", value: "No" },
            { label: "Reported by", value: "Repair facility" },
          ],
        ],
      },
      {
        key: "liens",
        title: "Liens & repossessions",
        description: "Financial interests recorded against the vehicle.",
        emptyLabel: "No liens or repossessions were returned.",
        records: [
          [
            { label: "Date", value: "2015-06-19" },
            { label: "Type", value: "Lien" },
            { label: "Status", value: "Released 2019-02-11" },
            { label: "State", value: "KY" },
          ],
        ],
      },
      {
        key: "sales",
        title: "Sales & listing history",
        description:
          "Prior retail and auction listings, including asking prices where available.",
        emptyLabel: "No prior sales listings were returned.",
        records: [
          [
            { label: "Date", value: "2024-08-14" },
            { label: "Listing price", value: "$11,450" },
            { label: "Odometer", value: "120,880 mi" },
            { label: "Seller type", value: "Franchise dealer" },
            { label: "Location", value: "Nashville, TN" },
          ],
          [
            { label: "Date", value: "2019-02-22" },
            { label: "Listing price", value: "$9,995" },
            { label: "Odometer", value: "78,120 mi" },
            { label: "Seller type", value: "Independent dealer" },
            { label: "Location", value: "Bowling Green, KY" },
          ],
        ],
      },
      {
        key: "recalls",
        title: "Safety recalls",
        description: "Manufacturer recall campaigns that apply to this vehicle.",
        emptyLabel: "No recall campaigns were returned.",
        records: [
          [
            { label: "Campaign", value: "14V-651 (sample)" },
            { label: "Reported", value: "2014-10-21" },
            { label: "Component", value: "Air bag inflator" },
            {
              label: "Summary",
              value:
                "Illustrative recall entry included so you can see how campaign details are laid out.",
            },
            { label: "Remedy", value: "Dealer replaces the inflator free of charge." },
          ],
        ],
      },
      {
        key: "thefts",
        title: "Theft records",
        description: "Reported thefts and recoveries.",
        emptyLabel: "No theft records were returned.",
        records: [],
      },
      {
        key: "impounds",
        title: "Impound records",
        description: "Impound and towing events.",
        emptyLabel: "No impound records were returned.",
        records: [],
      },
      {
        key: "exports",
        title: "Export records",
        description: "Records of the vehicle leaving the country.",
        emptyLabel: "No export records were returned.",
        records: [],
      },
    ],
  };
}
