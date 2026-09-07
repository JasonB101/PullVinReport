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
          "Each title and registration event we found for this VIN, newest first, as reported by the issuing state.",
        emptyLabel: "No title or registration events came back for this VIN.",
        columns: ["Date", "State", "Odometer", "Current"],
        records: [
          [
            { label: "Date", value: "Sep 27, 2024" },
            { label: "State", value: "TN" },
            { label: "Odometer", value: "121,477 mi" },
            { label: "Current", value: "Yes" },
            { label: "Vehicle use", value: "Personal" },
          ],
          [
            { label: "Date", value: "Mar 8, 2019" },
            { label: "State", value: "TN" },
            { label: "Odometer", value: "78,930 mi" },
            { label: "Current", value: "No" },
            { label: "Vehicle use", value: "Personal" },
          ],
          [
            { label: "Date", value: "Jun 19, 2015" },
            { label: "State", value: "KY" },
            { label: "Odometer", value: "41,204 mi" },
            { label: "Current", value: "No" },
            { label: "Vehicle use", value: "Personal" },
          ],
          [
            { label: "Date", value: "Apr 2, 2012" },
            { label: "State", value: "KY" },
            { label: "Odometer", value: "12 mi" },
            { label: "Current", value: "No" },
            { label: "Vehicle use", value: "Personal" },
            { label: "Title type", value: "First title issued" },
          ],
        ],
      },
      {
        key: "jsi",
        title: "Junk, salvage & insurance records",
        description:
          "NMVTIS junk, salvage and total-loss entries reported by insurers, recyclers and salvage yards.",
        emptyLabel: "No junk, salvage or insurance-loss records came back.",
        records: [],
      },
      {
        key: "accidents",
        title: "Accident & damage records",
        description: "Reported collision and damage events.",
        emptyLabel: "No accident or damage records came back.",
        columns: ["Date", "State", "City", "Severity", "Damage"],
        records: [
          [
            { label: "Date", value: "Nov 2, 2018" },
            { label: "State", value: "TN" },
            { label: "City", value: "Knoxville" },
            { label: "Severity", value: "Minor" },
            { label: "Damage", value: "Rear bumper" },
            { label: "Airbags deployed", value: "No" },
            { label: "Reported by", value: "Repair facility" },
          ],
        ],
      },
      {
        key: "liens",
        title: "Liens & repossessions",
        description: "Financial interests recorded against the vehicle.",
        emptyLabel: "No liens or repossessions came back.",
        columns: ["Date", "State", "Type", "Status"],
        records: [
          [
            { label: "Date", value: "Jun 19, 2015" },
            { label: "State", value: "KY" },
            { label: "Type", value: "Lien" },
            { label: "Status", value: "Released Feb 11, 2019" },
          ],
        ],
      },
      {
        key: "sales",
        title: "Sales & listing history",
        description:
          "Prior retail and auction listings, including asking prices where available.",
        emptyLabel: "No prior sales listings came back.",
        columns: ["Date", "Price", "Odometer", "Seller type", "City", "State"],
        records: [
          [
            { label: "Date", value: "Aug 14, 2024" },
            { label: "Price", value: "$11,450" },
            { label: "Odometer", value: "120,880 mi" },
            { label: "Seller type", value: "Franchise dealer" },
            { label: "City", value: "Nashville" },
            { label: "State", value: "TN" },
          ],
          [
            { label: "Date", value: "Feb 22, 2019" },
            { label: "Price", value: "$9,995" },
            { label: "Odometer", value: "78,120 mi" },
            { label: "Seller type", value: "Independent dealer" },
            { label: "City", value: "Bowling Green" },
            { label: "State", value: "KY" },
          ],
        ],
      },
      {
        key: "recalls",
        title: "Safety recalls",
        description: "Manufacturer recall campaigns that apply to this vehicle.",
        emptyLabel: "No recall campaigns came back.",
        records: [
          [
            { label: "Campaign", value: "14V-651 (sample)" },
            { label: "Reported", value: "Oct 21, 2014" },
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
        emptyLabel: "No theft records came back.",
        records: [],
      },
      {
        key: "impounds",
        title: "Impound records",
        description: "Impound and towing events.",
        emptyLabel: "No impound records came back.",
        records: [],
      },
      {
        key: "exports",
        title: "Export records",
        description: "Records of the vehicle leaving the country.",
        emptyLabel: "No export records came back.",
        records: [],
      },
    ],
  };
}
