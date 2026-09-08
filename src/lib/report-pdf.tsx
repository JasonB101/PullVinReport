/**
 * The printable copy of a report that rides along with the receipt email.
 *
 * Buyers forward this to sellers, mechanics and family, so it deliberately
 * carries nothing private: no private report link, no order token, no raw
 * provider payload — just the vehicle, the records and the disclaimer.
 *
 * Only the 14 PDF standard fonts are used. Registering a webfont means
 * downloading it at render time, which is exactly the kind of cold-start
 * dependency that turns a serverless render into a timeout.
 */
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

import type { VehicleBrief } from "@/lib/ai-brief";
import { BRAND } from "@/lib/config";
import { REPORT_DISCLAIMER } from "@/lib/customer-copy";
import type { Field, ReportCheck, ReportSection, VehicleReport } from "@/lib/report";
import {
  currentEvent,
  formatEventDate,
  hasOdometerRollback,
  reportChips,
  reportNavItems,
  searchedAndEmpty,
  sectionTable,
  sectionsWithRecords,
  vehicleTitle,
} from "@/lib/report";
import { normalizeVin, prettyVin } from "@/lib/vin";

const INK = "#0f172a";
const MUTED = "#64748b";
const FAINT = "#94a3b8";
const LINE = "#e2e8f0";
const BRAND_BLUE = "#2563eb";

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 82,
    paddingHorizontal: 40,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: INK,
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: INK,
    paddingBottom: 12,
    marginBottom: 16,
  },
  brand: { fontFamily: "Helvetica-Bold", fontSize: 13, color: INK },
  kicker: {
    fontSize: 7,
    letterSpacing: 1.2,
    color: MUTED,
    marginTop: 3,
    textTransform: "uppercase",
  },
  vehicle: { fontFamily: "Helvetica-Bold", fontSize: 17, marginTop: 12 },
  vin: { fontFamily: "Courier", fontSize: 10, color: MUTED, marginTop: 3 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 10 },
  chip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 6,
    fontSize: 7.5,
  },
  contents: { color: FAINT, fontSize: 7.5, marginTop: 10 },
  metaRow: { flexDirection: "row", marginTop: 10, gap: 24 },
  metaLabel: { fontSize: 7, letterSpacing: 0.8, color: FAINT, textTransform: "uppercase" },
  metaValue: { fontFamily: "Helvetica-Bold", fontSize: 9, marginTop: 2 },

  summary: {
    backgroundColor: "#f8fafc",
    borderLeftWidth: 3,
    borderLeftColor: BRAND_BLUE,
    padding: 10,
  },

  /**
   * Blocks lead with their spacing rather than trailing it. react-pdf counts a
   * bottom margin as part of what has to fit on the page, so a table that fits
   * but whose margin does not gets pushed whole onto the next page, stranding
   * its heading above an empty half-page.
   */
  section: { marginTop: 16 },
  sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 11, marginBottom: 2 },
  sectionNote: { color: MUTED, marginBottom: 6, lineHeight: 1.4 },
  sharedNote: { color: FAINT, fontSize: 7.5, marginBottom: 6, lineHeight: 1.3 },
  currentNote: { marginBottom: 6, lineHeight: 1.3 },
  clearNote: { color: MUTED, marginTop: 8, lineHeight: 1.4 },
  briefHeading: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    letterSpacing: 0.6,
    color: MUTED,
    marginTop: 6,
    marginBottom: 3,
  },
  bullet: { marginBottom: 3, lineHeight: 1.35, paddingLeft: 4 },
  briefAside: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#fde68a",
    backgroundColor: "#fffbeb",
    borderRadius: 3,
    padding: 8,
  },
  briefAsideHeading: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    letterSpacing: 0.6,
    color: "#92400e",
    marginBottom: 4,
  },
  caveat: { color: FAINT, fontSize: 7.5, marginTop: 4, lineHeight: 1.3 },

  checkGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  check: {
    width: "31.6%",
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 3,
    padding: 6,
  },
  checkLabel: { fontFamily: "Helvetica-Bold", fontSize: 8 },
  checkDetail: { color: MUTED, fontSize: 7, marginTop: 2, lineHeight: 1.35 },

  tableHead: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  th: { fontFamily: "Helvetica-Bold", fontSize: 7, letterSpacing: 0.6, color: MUTED },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  // Typography belongs on the Text nodes: react-pdf mislays a View that
  // carries a `lineHeight`, and silently drops it when the View is
  // absolutely positioned.
  extras: {
    paddingHorizontal: 6,
    paddingBottom: 5,
  },
  extrasText: { color: MUTED, fontSize: 7, lineHeight: 1.25 },
  // Rules live on the rows, not on a box around them: a bordered container
  // that spans a page break gets stretched to the page edge.
  tableGroup: { borderBottomWidth: 1, borderBottomColor: LINE },
  table: {},

  card: {
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 3,
    padding: 8,
    marginBottom: 6,
  },
  cardText: { color: MUTED, lineHeight: 1 },

  specGrid: { flexDirection: "row", flexWrap: "wrap" },
  spec: { width: "33.3%", paddingRight: 10, marginBottom: 8 },
  specLabel: { fontSize: 7, color: FAINT, textTransform: "uppercase", letterSpacing: 0.6 },

  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 8,
    fontSize: 6.5,
    color: FAINT,
  },
  footerText: { lineHeight: 1.15 },
  pageNumber: { textAlign: "right", marginTop: 4 },
});

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

/** Header chips, matching the web report: only what the records already say. */
function Chips({ report }: { report: VehicleReport }) {
  const tones = {
    clear: { backgroundColor: "#ecfdf5", borderColor: "#a7f3d0", color: "#065f46" },
    flag: { backgroundColor: "#fffbeb", borderColor: "#fde68a", color: "#92400e" },
    neutral: { backgroundColor: "#f8fafc", borderColor: LINE, color: MUTED },
  };

  return (
    <View style={styles.chipRow}>
      {reportChips(report).map((chip) => (
        <Text key={chip.key} style={[styles.chip, tones[chip.tone]]}>
          {chip.label}
        </Text>
      ))}
    </View>
  );
}

/** Only the checks that fired get a box. A wall of "clear" boxes says nothing. */
function Flags({ checks }: { checks: ReportCheck[] }) {
  return (
    <View style={styles.checkGrid}>
      {checks.map((check) => (
        <View
          key={check.key}
          style={[styles.check, { backgroundColor: "#fffbeb", borderColor: "#fde68a" }]}
        >
          <Text style={styles.checkLabel}>{check.label}</Text>
          <Text style={styles.checkDetail}>{check.detail}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * The written brief, carried into the forwarded copy.
 *
 * The heading on the model-level list carries its own disclaimer, exactly as on
 * the web report: a PDF gets forwarded to people who never saw the page, and a
 * tendency of the model must not read as a finding about the car.
 */
function Brief({ brief }: { brief: VehicleBrief }) {
  return (
    <View style={styles.section} wrap>
      <View minPresenceAhead={96}>
        <Text style={styles.sectionTitle}>What to know</Text>
        <Text style={styles.sectionNote}>
          Written automatically from the records in this report.
        </Text>
      </View>

      <Text style={styles.briefHeading}>FROM THIS REPORT</Text>
      {brief.fromReport.map((item, index) => (
        <Text key={index} style={styles.bullet}>
          • {item}
        </Text>
      ))}

      {brief.commonForModel.length > 0 && (
        <View style={styles.briefAside} wrap={false}>
          <Text style={styles.briefAsideHeading}>
            COMMON FOR THIS MODEL — NOT CONFIRMED ON THIS VIN
          </Text>
          {brief.commonForModel.map((item, index) => (
            <Text key={index} style={[styles.bullet, { color: "#92400e" }]}>
              • {item}
            </Text>
          ))}
        </View>
      )}

      {brief.questions.length > 0 && (
        <>
          <Text style={styles.briefHeading}>QUESTIONS TO ASK THE SELLER</Text>
          {brief.questions.map((item, index) => (
            <Text key={index} style={styles.bullet}>
              • {item}
            </Text>
          ))}
        </>
      )}
    </View>
  );
}

function fieldList(fields: Field[]): string {
  return fields.map((field) => `${field.label}: ${field.value}`).join("  ·  ");
}

/** Record count below which a section is small enough to keep on one page. */
const KEEP_TOGETHER = 3;

function Section({ section }: { section: ReportSection }) {
  const table = sectionTable(section);
  const width = table ? `${(100 / table.columns.length).toFixed(3)}%` : "100%";
  const wraps = section.records.length > KEEP_TOGETHER;
  const current = currentEvent(section);

  return (
    // A short section moves to the next page whole rather than leaving its
    // heading stranded above the footer. A long one still flows, because
    // holding a twenty-row table together would waste most of a page.
    <View style={styles.section} wrap={wraps}>
      <View minPresenceAhead={96}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <Text style={styles.sectionNote}>{section.description}</Text>
        {current && (
          <Text style={styles.currentNote}>
            {current.label}: {current.fields.map((field) => field.value).join("  ·  ")}
          </Text>
        )}
        {section.shared && section.shared.length > 0 && (
          <Text style={styles.sharedNote}>
            Same on all {section.records.length} records — {fieldList(section.shared)}
          </Text>
        )}
      </View>

      {table ? (
        <View style={styles.table}>
          {/* A table that spans a page break repeats its header there. */}
          <View style={styles.tableHead} fixed={wraps}>
            {table.columns.map((column) => (
              <Text key={column} style={[styles.th, { width }]}>
                {column.toUpperCase()}
              </Text>
            ))}
          </View>
          {table.rows.map((row, index) => (
            <View key={index} style={styles.tableGroup} wrap={false}>
              <View style={styles.tableRow}>
                {row.cells.map((cell, cellIndex) => (
                  <Text
                    key={cellIndex}
                    style={{
                      width,
                      color: cellIndex === 0 ? INK : MUTED,
                      fontFamily: cellIndex === 0 ? "Helvetica-Bold" : "Helvetica",
                    }}
                  >
                    {cell || "—"}
                  </Text>
                ))}
              </View>
              {row.extras.length > 0 && (
                <View style={styles.extras}>
                  <Text style={styles.extrasText}>{fieldList(row.extras)}</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      ) : (
        <View>
          {section.records.map((fields, index) => (
            <View key={index} style={styles.card} wrap={false}>
              <Text style={styles.cardText}>{fieldList(fields)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export function ReportDocument({
  report,
  brief = null,
}: {
  report: VehicleReport;
  brief?: VehicleBrief | null;
}) {
  const title = vehicleTitle(report.vehicle);
  const generated = report.generatedAt.replace("T", " ").slice(0, 16);
  const flags = report.checks.filter((check) => check.status === "found");
  const clear = searchedAndEmpty(report);
  const sections = sectionsWithRecords(report);
  const contents = reportNavItems(report).map((item) => item.label);
  const odometer = [...report.odometer].reverse();

  return (
    <Document
      title={`${BRAND.name} — ${title}`}
      author={BRAND.name}
      subject={`Vehicle history report for VIN ${report.vin}`}
    >
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header} fixed>
          <Text style={styles.brand}>{BRAND.name}</Text>
          <Text style={styles.kicker}>
            {report.isSample ? "Sample report — fictional data" : "Vehicle history report"}
          </Text>
        </View>

        {/* The vehicle and its VIN are stated here and nowhere else. */}
        <Text style={styles.vehicle}>{title}</Text>
        <Text style={styles.vin}>{prettyVin(report.vin)}</Text>
        <Chips report={report} />
        {/* The kicker above says whether these are live or sample records. */}
        <View style={styles.metaRow}>
          <Meta label="Generated" value={`${generated} UTC`} />
        </View>
        <Text style={styles.contents}>In this report: {contents.join("  ·  ")}</Text>

        <View style={[styles.summary, { marginTop: 16 }]}>
          <Text>{report.headline}</Text>
        </View>

        {brief && <Brief brief={brief} />}

        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>What we found</Text>
          {flags.length > 0 ? (
            <>
              <Text style={styles.sectionNote}>
                {flags.length === 1
                  ? "One of the checks we run came back with records."
                  : `${flags.length} of the checks we run came back with records.`}
              </Text>
              <Flags checks={flags} />
            </>
          ) : (
            <Text style={styles.sectionNote}>
              None of the checks we run came back with a record for this VIN.
            </Text>
          )}
          {clear.length > 0 && (
            <Text style={styles.clearNote}>
              Searched, nothing on file: {clear.join("  ·  ")}
            </Text>
          )}
          <Text style={styles.caveat}>
            Nothing on file means no matching record was found — not that an
            event never happened.
          </Text>
        </View>

        {odometer.length > 0 && (
          <View style={styles.section} wrap={odometer.length > KEEP_TOGETHER}>
            <View minPresenceAhead={96}>
              <Text style={styles.sectionTitle}>Odometer readings</Text>
              <Text style={styles.sectionNote}>
                Mileage as reported at each title event, newest first.
                {hasOdometerRollback(report.odometer)
                  ? " A reading lower than an earlier one is marked as a possible rollback."
                  : ""}
              </Text>
            </View>
            <View style={styles.table}>
              <View style={styles.tableHead}>
                <Text style={[styles.th, { width: "34%" }]}>DATE</Text>
                <Text style={[styles.th, { width: "33%" }]}>READING</Text>
                <Text style={[styles.th, { width: "33%" }]}>SOURCE</Text>
              </View>
              {odometer.map((reading, index) => {
                const unchanged = odometer[index + 1]?.value === reading.value;
                return (
                  <View
                    key={index}
                    style={[styles.tableRow, styles.tableGroup]}
                    wrap={false}
                  >
                    <Text style={{ width: "34%", fontFamily: "Helvetica-Bold" }}>
                      {formatEventDate(reading.date)}
                    </Text>
                    <Text style={{ width: "33%", color: unchanged ? FAINT : INK }}>
                      {reading.value.toLocaleString("en-US")} {reading.unit}
                      {unchanged ? "  (unchanged)" : ""}
                    </Text>
                    <Text style={{ width: "33%", color: MUTED }}>{reading.source}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {sections.map((section) => (
          <Section key={section.key} section={section} />
        ))}

        {report.specifications.length > 0 && (
          <View style={styles.section} wrap={false}>
            <View minPresenceAhead={96}>
              <Text style={styles.sectionTitle}>Vehicle specifications</Text>
              <Text style={styles.sectionNote}>
                Decoded from the VIN and the manufacturer&apos;s build record.
              </Text>
            </View>
            <View style={styles.specGrid}>
              {report.specifications.map((spec, index) => (
                <View key={`${spec.label}-${index}`} style={styles.spec}>
                  <Text style={styles.specLabel}>{spec.label}</Text>
                  <Text>{spec.value}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {report.isSample
              ? "Sample report. All data shown is fictional and provided for illustration only."
              : REPORT_DISCLAIMER}
          </Text>
          <Text
            style={styles.pageNumber}
            render={({ pageNumber, totalPages }) =>
              `${BRAND.name} · ${BRAND.domain} · Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

/** What the attachment is called once it lands in the buyer's inbox. */
export function reportPdfFilename(vin: string): string {
  return `${BRAND.name}-${normalizeVin(vin).replace(/[^A-Z0-9]/g, "")}.pdf`;
}

export async function renderReportPdf(
  report: VehicleReport,
  brief: VehicleBrief | null = null,
): Promise<Buffer> {
  return renderToBuffer(<ReportDocument report={report} brief={brief} />);
}
