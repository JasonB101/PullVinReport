import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  paidReportPdfPath,
  pdfFileResponse,
  pdfForPaidReport,
  pdfForSampleReport,
  SAMPLE_REPORT_PDF_PATH,
} from "@/lib/report-pdf-serve";
import { FileOrderStore } from "@/lib/store/file-store";
import { normalizeVinAuditReport } from "@/lib/vinaudit";

const VIN = "4T1BF1FK8CU512345";
const SRC = fileURLToPath(new URL("../src/", import.meta.url));

function paidReport() {
  return normalizeVinAuditReport(
    {
      attributes: { Year: "2012", Make: "Toyota", Model: "Camry" },
      titles: [
        {
          vin: VIN,
          date: "2024-09-27",
          state: "TN",
          meter: "121477",
          meterunit: "M",
          current: true,
        },
      ],
    },
    VIN,
  );
}

describe("download uses the server PDF, not window.print", () => {
  it("fetches the generated file from the report PDF endpoint", async () => {
    const button = await readFile(path.join(SRC, "components/download-pdf-button.tsx"), "utf8");
    const paid = await readFile(path.join(SRC, "app/report/[token]/page.tsx"), "utf8");
    const sample = await readFile(path.join(SRC, "app/sample/page.tsx"), "utf8");
    const paidRoute = await readFile(
      path.join(SRC, "app/api/report/[token]/pdf/route.ts"),
      "utf8",
    );
    const sampleRoute = await readFile(path.join(SRC, "app/api/sample/pdf/route.ts"), "utf8");

    assert.match(button, /fetch\(href/);
    assert.match(button, /createObjectURL\(blob\)/);
    assert.match(button, /Download PDF/);
    assert.doesNotMatch(button, /window\.print/);

    assert.match(paid, /DownloadPdfButton/);
    assert.match(paid, /paidReportPdfPath\(token\)/);
    assert.doesNotMatch(paid, /PrintButton|window\.print/);

    assert.match(sample, /DownloadPdfButton/);
    assert.match(sample, /SAMPLE_REPORT_PDF_PATH/);
    assert.doesNotMatch(sample, /PrintButton|window\.print/);

    assert.match(paidRoute, /pdfForPaidReport/);
    assert.match(sampleRoute, /pdfForSampleReport/);
    assert.equal(SAMPLE_REPORT_PDF_PATH, "/api/sample/pdf");
    assert.equal(paidReportPdfPath("tok_abc"), "/api/report/tok_abc/pdf");
  });

  it("does not leave a print-button that still calls window.print", async () => {
    const files = [
      "components/print-button.tsx",
      "components/download-pdf-button.tsx",
      "app/report/[token]/page.tsx",
      "app/sample/page.tsx",
    ];
    for (const file of files) {
      try {
        const source = await readFile(path.join(SRC, file), "utf8");
        assert.doesNotMatch(source, /window\.print/, file);
      } catch (error) {
        if (file === "components/print-button.tsx" && (error as NodeJS.ErrnoException).code === "ENOENT") {
          continue;
        }
        throw error;
      }
    }
  });
});

describe("sample PDF download", () => {
  it("renders a SAMPLE-labelled PDF from the same fixtures as /sample", async () => {
    const { buffer, filename } = await pdfForSampleReport();
    assert.equal(buffer.subarray(0, 5).toString("latin1"), "%PDF-");
    assert.equal(filename, `PullVinReport-SAMPLE-${VIN}.pdf`);
    assert.ok(buffer.byteLength > 4_000);
  });
});

describe("paid PDF download", () => {
  let dataDir = "";
  const realFetch = globalThis.fetch;

  before(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), "pvr-pdf-dl-"));
    globalThis.fetch = (async () =>
      new Response("nope", { status: 404 })) as typeof fetch;
  });

  after(async () => {
    globalThis.fetch = realFetch;
    await rm(dataDir, { recursive: true, force: true });
  });

  it("returns 404 for a guessed token and for an unpaid order", async () => {
    const store = new FileOrderStore(dataDir);
    await store.init();

    const missing = await pdfForPaidReport("not-a-real-token", store);
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.status, 404);

    const pending = await store.create({
      vin: VIN,
      email: "buyer@example.com",
      amountCents: 1499,
      currency: "usd",
    });
    const unpaid = await pdfForPaidReport(pending.accessToken, store);
    assert.equal(unpaid.ok, false);
    if (!unpaid.ok) assert.equal(unpaid.status, 404);
  });

  it("renders a real PDF only when the token holds a report", async () => {
    const store = new FileOrderStore(dataDir);
    await store.init();
    const order = await store.create({
      vin: VIN,
      email: "buyer@example.com",
      amountCents: 1499,
      currency: "usd",
    });
    await store.update(order.id, {
      status: "fulfilled",
      report: paidReport(),
      fulfilledAt: new Date().toISOString(),
    });

    const result = await pdfForPaidReport(order.accessToken, store);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.buffer.subarray(0, 5).toString("latin1"), "%PDF-");
      assert.equal(result.filename, `PullVinReport-${VIN}.pdf`);
      assert.doesNotMatch(result.filename, /SAMPLE/);
    }
  });
});

describe("PDF file response", () => {
  it("serves the bytes as an attachment, not a printed page", async () => {
    const body = Buffer.from("%PDF-test");
    const response = pdfFileResponse(body, "PullVinReport-SAMPLE.pdf");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "application/pdf");
    assert.match(
      response.headers.get("Content-Disposition") ?? "",
      /attachment; filename="PullVinReport-SAMPLE.pdf"/,
    );
    assert.equal(await response.text(), "%PDF-test");
  });
});
