import type { VehicleBrief } from "@/lib/ai-brief";
import type { VehicleReport } from "@/lib/report";

/**
 * The sample report shown before checkout.
 *
 * This is static, fictional data. It exists so shoppers know exactly what they
 * are buying. It is tagged `source: "sample"` / `isSample: true` and every
 * renderer keys its SAMPLE watermark off those flags, so it can never be shown
 * in place of a purchased report.
 *
 * It is also shaped exactly like a normalized paid report — constants lifted out
 * of the records, no VIN on the rows, empty categories left empty — so the
 * sample cannot drift into promising a layout a real report does not have.
 */
export const SAMPLE_VIN = "4T1BF1FK8CU512345";

export const SAMPLE_VEHICLE_LABEL = "2012 Toyota Camry SE";

/**
 * The sample's brief, written by hand rather than generated.
 *
 * A shopper browsing the sample should see the shape of the brief they will get,
 * and generating one for a vehicle that does not exist would spend tokens on
 * every visit to say the same thing. The wording deliberately matches the rules
 * a generated brief is held to: nothing claimed that the sample records do not
 * show, and the model-level notes kept separate from the car.
 */
export function buildSampleBrief(): VehicleBrief {
  return {
    fromReport: [
      "Five title records across Kentucky and Tennessee, with no salvage, junk or insurance-loss brand on any of them.",
      "Mileage rises steadily from 12 miles in 2012 to 121,477 in 2024, and the 2020 re-registration reported the same reading as 2019.",
      "One minor rear-bumper damage record from November 2018 in Knoxville, with no airbag deployment reported.",
      "A lien recorded in Kentucky in 2015 is shown as released in February 2019.",
      "One open recall campaign is listed for the air bag inflator.",
    ],
    commonForModel: [
      "This generation of Camry is known for excessive oil consumption on some four-cylinder engines.",
      "Water pump and AC condenser failures are frequently reported around 100,000 miles.",
      "Dashboard material becoming sticky or shiny in hot climates was widespread enough to prompt a warranty extension.",
    ],
    questions: [
      "Was the 2018 rear-end damage repaired by a shop, and are the receipts available?",
      "Has the open air bag recall been completed at a dealer?",
      "Why did the odometer not move between the 2019 and 2020 registrations?",
      "Can you show maintenance records covering oil consumption checks?",
    ],
    model: "sample",
  };
}

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
    // Year, make, model and trim head the report, so they are not restated here.
    specifications: [
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
        count: 5,
        detail: "5 title records across 2 states",
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
    // The 2020 re-registration reported the same mileage as 2019, which is what
    // an unchanged reading looks like on a real report.
    odometer: [
      { date: "2012-04-02", value: 12, unit: "mi", source: "KY" },
      { date: "2015-06-19", value: 41_204, unit: "mi", source: "KY" },
      { date: "2019-03-08", value: 78_930, unit: "mi", source: "TN" },
      { date: "2020-04-02", value: 78_930, unit: "mi", source: "TN" },
      { date: "2024-09-27", value: 121_477, unit: "mi", source: "TN" },
    ],
    sections: [
      {
        key: "titles",
        title: "Title & registration history",
        navLabel: "Titles",
        description:
          "Each title and registration event we found for this VIN, newest first, as reported by the issuing state.",
        emptyLabel: "No title or registration events came back for this VIN.",
        columns: ["Date", "State", "Mileage", "Event", "Current"],
        // The provider reports the use on every event, so it is stated once.
        shared: [{ label: "Vehicle use", value: "Personal" }],
        records: [
          [
            { label: "Date", value: "Sep 27, 2024" },
            { label: "State", value: "TN" },
            { label: "Mileage", value: "121,477 mi" },
            { label: "Event", value: "Title transfer" },
            { label: "Current", value: "Yes" },
          ],
          [
            { label: "Date", value: "Apr 2, 2020" },
            { label: "State", value: "TN" },
            { label: "Mileage", value: "78,930 mi" },
            { label: "Event", value: "Registration renewal" },
            { label: "Current", value: "No" },
          ],
          [
            { label: "Date", value: "Mar 8, 2019" },
            { label: "State", value: "TN" },
            { label: "Mileage", value: "78,930 mi" },
            { label: "Event", value: "Title transfer" },
            { label: "Current", value: "No" },
          ],
          [
            { label: "Date", value: "Jun 19, 2015" },
            { label: "State", value: "KY" },
            { label: "Mileage", value: "41,204 mi" },
            { label: "Event", value: "Title transfer" },
            { label: "Current", value: "No" },
          ],
          [
            { label: "Date", value: "Apr 2, 2012" },
            { label: "State", value: "KY" },
            { label: "Mileage", value: "12 mi" },
            { label: "Event", value: "First title issued" },
            { label: "Current", value: "No" },
          ],
        ],
      },
      {
        key: "jsi",
        title: "Junk, salvage & insurance records",
        navLabel: "Junk & salvage",
        description:
          "NMVTIS junk, salvage and total-loss entries reported by insurers, recyclers and salvage yards.",
        emptyLabel: "No junk, salvage or insurance-loss records came back.",
        records: [],
      },
      {
        key: "accidents",
        title: "Accident & damage records",
        navLabel: "Accidents",
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
        navLabel: "Liens",
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
        navLabel: "Sales",
        description:
          "Prior retail and auction listings, including asking prices where available.",
        emptyLabel: "No prior sales listings came back.",
        columns: ["Date", "Price", "Mileage", "Seller type", "City", "State"],
        records: [
          [
            { label: "Date", value: "Aug 14, 2024" },
            { label: "Price", value: "$11,450" },
            { label: "Mileage", value: "120,880 mi" },
            { label: "Seller type", value: "Franchise dealer" },
            { label: "City", value: "Nashville" },
            { label: "State", value: "TN" },
          ],
          [
            { label: "Date", value: "Feb 22, 2019" },
            { label: "Price", value: "$9,995" },
            { label: "Mileage", value: "78,120 mi" },
            { label: "Seller type", value: "Independent dealer" },
            { label: "City", value: "Bowling Green" },
            { label: "State", value: "KY" },
          ],
        ],
      },
      {
        key: "recalls",
        title: "Safety recalls",
        navLabel: "Recalls",
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
        navLabel: "Thefts",
        description: "Reported thefts and recoveries.",
        emptyLabel: "No theft records came back.",
        records: [],
      },
      {
        key: "impounds",
        title: "Impound records",
        navLabel: "Impounds",
        description: "Impound and towing events.",
        emptyLabel: "No impound records came back.",
        records: [],
      },
      {
        key: "exports",
        title: "Export records",
        navLabel: "Exports",
        description: "Records of the vehicle leaving the country.",
        emptyLabel: "No export records came back.",
        records: [],
      },
    ],
  };
}
