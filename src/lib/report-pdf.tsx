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

import { BRAND } from "@/lib/config";
import { REPORT_DISCLAIMER } from "@/lib/customer-copy";
import type { Field, ReportCheck, ReportSection, VehicleReport } from "@/lib/report";
import { formatEventDate, sectionTable, vehicleTitle } from "@/lib/report";
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
  metaRow: { flexDirection: "row", marginTop: 10, gap: 24 },
  metaLabel: { fontSize: 7, letterSpacing: 0.8, color: FAINT, textTransform: "uppercase" },
  metaValue: { fontFamily: "Helvetica-Bold", fontSize: 9, marginTop: 2 },

  summary: {
    backgroundColor: "#f8fafc",
    borderLeftWidth: 3,
    borderLeftColor: BRAND_BLUE,
    padding: 10,
    marginBottom: 18,
  },

  sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 11, marginBottom: 2 },
  sectionNote: { color: MUTED, marginBottom: 6, lineHeight: 1.4 },

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
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  // Typography belongs on the Text nodes: react-pdf mislays a View that
  // carries a `lineHeight`, and silently drops it when the View is
  // absolutely positioned.
  extras: {
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingHorizontal: 6,
    paddingTop: 3,
    paddingBottom: 5,
  },
  extrasText: { color: MUTED, fontSize: 7, lineHeight: 1.25 },
  table: { borderWidth: 1, borderColor: LINE, borderRadius: 3, marginBottom: 14 },

  card: {
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 3,
    padding: 8,
    marginBottom: 6,
  },
  cardText: { color: MUTED, lineHeight: 1 },
  empty: { color: MUTED, marginBottom: 14 },

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

function Checks({ checks }: { checks: ReportCheck[] }) {
  return (
    <View style={styles.checkGrid}>
      {checks.map((check) => (
        <View
          key={check.key}
          style={[
            styles.check,
            {
              backgroundColor: check.status === "found" ? "#fffbeb" : "#f8fafc",
              borderColor: check.status === "found" ? "#fde68a" : LINE,
            },
          ]}
        >
          <Text style={styles.checkLabel}>{check.label}</Text>
          <Text style={styles.checkDetail}>{check.detail}</Text>
        </View>
      ))}
    </View>
  );
}

function fieldList(fields: Field[]): string {
  return fields.map((field) => `${field.label}: ${field.value}`).join("  ·  ");
}

function Section({ section }: { section: ReportSection }) {
  const table = sectionTable(section);
  const width = table ? `${(100 / table.columns.length).toFixed(3)}%` : "100%";

  return (
    <View>
      {/* Keeps a heading from being stranded at the foot of a page. */}
      <View minPresenceAhead={96}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <Text style={styles.sectionNote}>{section.description}</Text>
      </View>

      {section.records.length === 0 ? (
        <Text style={styles.empty}>{section.emptyLabel}</Text>
      ) : table ? (
        <View style={styles.table}>
          <View style={styles.tableHead} fixed>
            {table.columns.map((column) => (
              <Text key={column} style={[styles.th, { width }]}>
                {column.toUpperCase()}
              </Text>
            ))}
          </View>
          {table.rows.map((row, index) => (
            <View key={index} wrap={false}>
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
        <View style={{ marginBottom: 8 }}>
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

export function ReportDocument({ report }: { report: VehicleReport }) {
  const title = vehicleTitle(report.vehicle);
  const generated = report.generatedAt.replace("T", " ").slice(0, 16);

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

        <Text style={styles.vehicle}>{title}</Text>
        <Text style={styles.vin}>{prettyVin(report.vin)}</Text>
        <View style={styles.metaRow}>
          <Meta label="Generated" value={`${generated} UTC`} />
          <Meta
            label="Records flagged"
            value={`${report.checks.filter((check) => check.status === "found").length} of ${report.checks.length}`}
          />
          <Meta label="Records" value={report.isSample ? "Sample" : "Live"} />
        </View>

        <View style={[styles.summary, { marginTop: 16 }]}>
          <Text>{report.headline}</Text>
        </View>

        <Text style={styles.sectionTitle}>At a glance</Text>
        <Text style={styles.sectionNote}>
          An unshaded box means no matching record was found — not that an event
          never happened.
        </Text>
        <View style={{ marginBottom: 18 }}>
          <Checks checks={report.checks} />
        </View>

        {report.odometer.length > 0 && (
          <View>
            <View minPresenceAhead={96}>
              <Text style={styles.sectionTitle}>Odometer readings</Text>
              <Text style={styles.sectionNote}>
                Mileage captured at each title event, oldest first.
              </Text>
            </View>
            <View style={styles.table}>
              <View style={styles.tableHead}>
                <Text style={[styles.th, { width: "34%" }]}>DATE</Text>
                <Text style={[styles.th, { width: "33%" }]}>READING</Text>
                <Text style={[styles.th, { width: "33%" }]}>SOURCE</Text>
              </View>
              {report.odometer.map((reading, index) => (
                <View key={index} style={styles.tableRow} wrap={false}>
                  <Text style={{ width: "34%", fontFamily: "Helvetica-Bold" }}>
                    {formatEventDate(reading.date)}
                  </Text>
                  <Text style={{ width: "33%", color: MUTED }}>
                    {reading.value.toLocaleString("en-US")} {reading.unit}
                  </Text>
                  <Text style={{ width: "33%", color: MUTED }}>{reading.source}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {report.sections.map((section) => (
          <Section key={section.key} section={section} />
        ))}

        {report.specifications.length > 0 && (
          <View>
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

export async function renderReportPdf(report: VehicleReport): Promise<Buffer> {
  return renderToBuffer(<ReportDocument report={report} />);
}
