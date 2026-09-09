import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cleanCustomerLine, cleanCustomerText } from "@/lib/customer-text";
import { sectionListings } from "@/lib/report";
import { normalizeVinAuditReport } from "@/lib/vinaudit";
import { parseComplaintsPayload, parseRecallsPayload } from "@/lib/model-extras";
import { parseBrief } from "@/lib/ai-brief";

const VIN = "4T1BF1FK8CU512345";

describe("cleanCustomerText", () => {
  it("turns br / </br> / self-closing breaks into newlines and drops other tags", () => {
    assert.equal(
      cleanCustomerText("One-owner trade-in<br>New tyres</br>Sold as-is<br/>Call today"),
      "One-owner trade-in\nNew tyres\nSold as-is\nCall today",
    );
    assert.equal(
      cleanCustomerText("<p>Rear bumper</p><div>Airbags deployed</div>"),
      "Rear bumper\nAirbags deployed",
    );
    assert.equal(cleanCustomerText("Minor <b>rear</b> damage"), "Minor rear damage");
  });

  it("decodes escaped and double-encoded br leaks", () => {
    assert.equal(
      cleanCustomerText("Clean title&lt;br&gt;CarFax available"),
      "Clean title\nCarFax available",
    );
    assert.equal(
      cleanCustomerText("Clean title&amp;lt;br&amp;gt;CarFax available"),
      "Clean title\nCarFax available",
    );
    assert.equal(cleanCustomerText("A &amp; B &nbsp; C"), "A & B C");
  });

  it("strips leftover markdown emphasis without inventing HTML", () => {
    assert.equal(
      cleanCustomerText("Ask for **service records** and `receipts`."),
      "Ask for service records and receipts.",
    );
  });

  it("folds breaks to a single line when the caller asked for one", () => {
    assert.equal(
      cleanCustomerLine("One-owner<br>trade-in"),
      "One-owner trade-in",
    );
  });
});

describe("provider and extras ingest", () => {
  it("strips listing HTML when a paid report is normalized", () => {
    const report = normalizeVinAuditReport(
      {
        attributes: { Year: "2012", Make: "Toyota", Model: "Camry" },
        sales: [
          {
            date: "2024-08-14",
            listing_type: "Dealer classified",
            description:
              "One-owner trade-in<br>Service records available</br>Sold as-is.",
          },
        ],
      },
      VIN,
    );
    const [card] = sectionListings(
      report.sections.find((section) => section.key === "sales")!,
    );
    const description = card.detail.find((field) => field.label === "Description");
    assert.equal(
      description?.value,
      "One-owner trade-in\nService records available\nSold as-is.",
    );
    assert.doesNotMatch(description?.value ?? "", /<\/?br/i);
  });

  it("strips NHTSA complaint and recall markup at parse time", () => {
    const complaints = parseComplaintsPayload({
      count: 1,
      results: [
        {
          odiNumber: 9,
          components: "ENGINE",
          summary: "Oil consumption&lt;br&gt;Dealer said it was normal.",
          dateComplaintFiled: "01/02/2024",
        },
      ],
    });
    assert.equal(
      complaints?.samples[0]?.summary,
      "Oil consumption Dealer said it was normal.",
    );

    const recalls = parseRecallsPayload({
      Count: 1,
      results: [
        {
          NHTSACampaignNumber: "13V014000",
          Component: "AIR BAGS",
          Consequence: "Airbags may not deploy.<br>Risk of injury.",
          Remedy: "Dealers will recalibrate the sensors.",
        },
      ],
    });
    assert.equal(
      recalls?.campaigns[0]?.consequence,
      "Airbags may not deploy. Risk of injury.",
    );
    assert.doesNotMatch(JSON.stringify(recalls), /<br/i);
  });

  it("strips HTML and markdown from a generated brief", () => {
    const brief = parseBrief(
      JSON.stringify({
        fromReport: [
          "Five title records<br>across two states — no salvage brand.",
        ],
        commonForModel: ["On the 2012 Toyota Camry, **oil consumption** is known."],
        questions: ["Was the 2018 damage repaired?</br>Are receipts available?"],
      }),
      "test",
      { year: "2012", make: "Toyota", model: "Camry" },
    );
    assert.ok(brief);
    assert.equal(
      brief.fromReport[0],
      "Five title records\nacross two states — no salvage brand.",
    );
    assert.match(brief.commonForModel[0] ?? "", /oil consumption/);
    assert.doesNotMatch(brief.commonForModel[0] ?? "", /\*\*/);
    assert.doesNotMatch(JSON.stringify(brief), /<\/?br/i);
  });
});
