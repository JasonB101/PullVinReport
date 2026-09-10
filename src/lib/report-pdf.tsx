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
 *
 * Nothing here sets `lineHeight`. In this renderer the value is added to the
 * line box rather than used as it, so `lineHeight: 1` on 9pt text leaves about
 * 18pt of leading — near double-spacing, and it compounds down the page until
 * a two-page report is four. The font's own metrics are already right.
 */
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

import type { VehicleBrief } from "@/lib/ai-brief";
import { BRAND } from "@/lib/config";
import type { ModelExtras } from "@/lib/model-extras";
import {
  complaintSamples,
  hasModelExtras,
  modelExtrasSummaryLine,
} from "@/lib/model-extras";
import { REPORT_DISCLAIMER } from "@/lib/customer-copy";
import {
  cleanBrief,
  cleanCustomerLine,
  cleanModelExtras,
  cleanReport,
} from "@/lib/customer-text";
import {
  COMMON_FOR_MODEL,
  FROM_THIS_VIN,
  MODEL_ZONE_NOTE,
  MODEL_ZONE_TITLE,
  QUESTIONS_HEADING,
  THIS_VIN_CHIP,
} from "@/lib/report-zones";
import type {
  Field,
  Listing,
  ListingGroup,
  ReportCheck,
  ReportSection,
  VehicleReport,
} from "@/lib/report";
import {
  currentEvent,
  formatGeneratedAt,
  foundIssueChecks,
  hasOdometerRollback,
  headerSpecifications,
  reportChips,
  reportNavItems,
  searchedAndEmpty,
  sectionListingGroups,
  sectionTable,
  sectionsWithRecords,
  vehicleTitle,
  withResolvedDispositions,
} from "@/lib/report";
import { reportHealth } from "@/lib/report-health";
import { HERO_ILLUSTRATION_LABEL } from "@/lib/vehicle-hero";
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
  vehicleBlock: { marginTop: 12 },
  vehicleBlockWithHero: { marginTop: 12, paddingRight: 148, minHeight: 72 },
  vehicle: { fontFamily: "Helvetica-Bold", fontSize: 17 },
  vin: { fontFamily: "Courier", fontSize: 10, color: MUTED, marginTop: 3 },
  hero: { position: "absolute", right: 0, top: 4, width: 136 },
  heroFrame: { width: 136, overflow: "hidden" },
  heroImage: { width: 136, height: 52, objectFit: "contain" },
  heroLabel: {
    fontSize: 6.5,
    color: FAINT,
    textAlign: "center",
    marginTop: 1,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
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
  sectionNote: { color: MUTED, marginBottom: 6 },
  sharedNote: { color: FAINT, fontSize: 7.5, marginBottom: 6 },
  currentNote: { marginBottom: 6 },
  clearNote: { color: MUTED, marginTop: 8 },
  briefHeading: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    letterSpacing: 0.6,
    color: MUTED,
    marginTop: 6,
    marginBottom: 3,
  },
  bullet: { marginBottom: 3, paddingLeft: 4 },
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
  caveat: { color: FAINT, fontSize: 7.5, marginTop: 4 },

  checkGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  check: {
    width: "31.6%",
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 3,
    padding: 6,
  },
  checkLabel: { fontFamily: "Helvetica-Bold", fontSize: 8 },
  checkDetail: { color: MUTED, fontSize: 7, marginTop: 2 },

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
  extras: {
    paddingHorizontal: 6,
    paddingBottom: 5,
  },
  extrasText: { color: MUTED, fontSize: 7 },
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
  cardText: { color: MUTED },

  listingHead: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  listingHeadline: { fontFamily: "Helvetica-Bold", fontSize: 10 },
  listingDate: { color: MUTED, fontSize: 7.5 },
  listingPrice: {
    marginLeft: "auto",
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
  },
  listingSummary: { marginTop: 3 },
  listingDetail: { color: MUTED, fontSize: 7, marginTop: 4 },
  relatedListing: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: LINE,
  },

  headerSpecs: { marginTop: 10 },
  specGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  spec: { width: "33.3%", paddingRight: 10, marginBottom: 6 },
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

/**
 * The written brief, carried into the forwarded copy.
 *
 * The heading on the model-level list carries its own disclaimer, exactly as on
 * the web report: a PDF gets forwarded to people who never saw the page, and a
 * tendency of the model must not read as a finding about the car.
 */
function Findings({
  flags,
  clear,
}: {
  flags: ReportCheck[];
  clear: string[];
}) {
  return (
    <View>
      {flags.length > 0 ? (
        <Text style={styles.sectionNote}>
          {flags
            .map((check) =>
              check.count > 0 ? `${check.label} (${check.count})` : check.label,
            )
            .join("  ·  ")}
        </Text>
      ) : (
        <Text style={styles.sectionNote}>
          None of the issue checks came back with a record for this VIN.
        </Text>
      )}
      {clear.length > 0 && (
        <Text style={styles.clearNote}>
          Searched, nothing on file: {clear.join("  ·  ")}
        </Text>
      )}
      <Text style={styles.caveat}>
        Nothing on file means no matching record was found — not that an event
        never happened.
      </Text>
    </View>
  );
}

function Health({ report }: { report: VehicleReport }) {
  const health = reportHealth(report);
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={styles.briefHeading}>
        REPORT HEALTH  {health.score}/100  ·  {health.label.toUpperCase()}
      </Text>
      <Text style={styles.caveat}>{health.disclaimer}</Text>
      {health.factors
        .filter(
          (factor) =>
            factor.impact !== "helps" ||
            factor.key === "salvage" ||
            factor.key === "post-salvage",
        )
        .slice(0, 8)
        .map((factor) => (
          <Text key={factor.key} style={styles.bullet}>
            • {factor.label} ({factor.impact}
            {factor.delta !== 0 ? ` ${factor.delta}` : ""}): {factor.reason}
          </Text>
        ))}
    </View>
  );
}

function Brief({
  report,
  brief,
  flags,
  clear,
}: {
  report: VehicleReport;
  brief: VehicleBrief | null;
  flags: ReportCheck[];
  clear: string[];
}) {
  return (
    <View style={styles.section} wrap>
      <View minPresenceAhead={96} wrap={false}>
        <Text style={styles.sectionTitle}>What to know</Text>
        <Text style={styles.sectionNote}>{THIS_VIN_CHIP} — from the records in this report.</Text>
        <Health report={report} />
        <Findings flags={flags} clear={clear} />
      </View>

      {brief && (
        <View wrap={false}>
          <Text style={styles.briefHeading}>{FROM_THIS_VIN.toUpperCase()}</Text>
          {brief.fromReport.map((item, index) => (
            <Text key={index} style={styles.bullet}>
              • {item}
            </Text>
          ))}
        </View>
      )}

      {brief && brief.questions.length > 0 && (
        <View wrap={false}>
          <Text style={styles.briefHeading}>{QUESTIONS_HEADING.toUpperCase()}</Text>
          {brief.questions.map((item, index) => (
            <Text key={index} style={styles.bullet}>
              • {item}
            </Text>
          ))}
        </View>
      )}

      {brief && brief.commonForModel.length > 0 && (
        <View style={styles.briefAside} wrap={false}>
          <Text style={styles.briefAsideHeading}>
            {COMMON_FOR_MODEL.toUpperCase()}
          </Text>
          {brief.commonForModel.map((item, index) => (
            <Text key={index} style={[styles.bullet, { color: "#92400e" }]}>
              • {item}
            </Text>
          ))}
          <Text style={[styles.caveat, { color: "#92400e" }]}>
            Known issues for this year, make and model — not findings on this VIN.
          </Text>
        </View>
      )}
    </View>
  );
}

function fieldList(fields: Field[]): string {
  return fields.map((field) => `${field.label}: ${field.value}`).join("  ·  ");
}

/** Record count below which a section is small enough to keep on one page. */
const KEEP_TOGETHER = 3;

function ListingFields({ listing }: { listing: Listing }) {
  return (
    <View>
      <View style={styles.listingHead}>
        <Text style={styles.listingHeadline}>{listing.headline}</Text>
        {listing.date.length > 0 && (
          <Text style={styles.listingDate}>{listing.date}</Text>
        )}
      </View>
      {listing.summary.length > 0 && (
        <Text style={styles.listingSummary}>{fieldList(listing.summary)}</Text>
      )}
      {listing.detail.length > 0 && (
        <Text style={styles.listingDetail}>{fieldList(listing.detail)}</Text>
      )}
    </View>
  );
}

/**
 * Paper has no disclosure, so a listing chapter prints once with every
 * snapshot underneath rather than repeating sister rooftops as sales.
 */
function ListingGroupCard({ group }: { group: ListingGroup }) {
  const facts = [
    group.location && `Location: ${group.location}`,
    group.mileage && `Mileage: ${group.mileage}`,
  ]
    .filter((part): part is string => Boolean(part))
    .join("  ·  ");

  return (
    <View style={styles.card} wrap>
      <View style={styles.listingHead}>
        <Text style={styles.listingHeadline}>{group.identity}</Text>
        {group.date.length > 0 && (
          <Text style={styles.listingDate}>{group.date}</Text>
        )}
        {group.price.length > 0 && (
          <Text style={styles.listingPrice}>{group.price}</Text>
        )}
      </View>
      {facts.length > 0 && <Text style={styles.listingSummary}>{facts}</Text>}
      {group.listings.length > 1 && (
        <Text style={styles.listingDetail}>
          {group.listings.length} listing snapshots
        </Text>
      )}
      {group.listings.length === 1 ? (
        group.listings[0].detail.length > 0 ? (
          <Text style={styles.listingDetail}>{fieldList(group.listings[0].detail)}</Text>
        ) : null
      ) : (
        group.listings.map((listing, index) => (
          <View key={index} style={styles.relatedListing} wrap={false}>
            <ListingFields listing={listing} />
          </View>
        ))
      )}
    </View>
  );
}

function Section({
  section,
  odometerRollback = false,
}: {
  section: ReportSection;
  odometerRollback?: boolean;
}) {
  const listings =
    section.layout === "listings" ? sectionListingGroups(section) : null;
  const table = listings ? null : sectionTable(section);
  const width = table ? `${(100 / table.columns.length).toFixed(3)}%` : "100%";
  const wraps = section.records.length > KEEP_TOGETHER;
  const current = currentEvent(section);
  const mileageIndex = table?.columns.indexOf("Mileage") ?? -1;

  return (
    // A short section moves to the next page whole rather than leaving its
    // heading stranded above the footer. A long one still flows, because
    // holding a twenty-row table together would waste most of a page.
    <View style={styles.section} wrap={wraps}>
      <View minPresenceAhead={96} wrap={false}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <Text style={styles.sectionNote}>
          {section.description}
          {odometerRollback
            ? " A reading lower than an earlier one is a possible rollback."
            : ""}
        </Text>
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

      {listings ? (
        <View>
          {listings.map((group, index) => (
            <ListingGroupCard key={index} group={group} />
          ))}
        </View>
      ) : table ? (
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
                      color:
                        cellIndex === 0
                          ? INK
                          : row.mileageUnchanged && cellIndex === mileageIndex
                            ? FAINT
                            : MUTED,
                      fontFamily: cellIndex === 0 ? "Helvetica-Bold" : "Helvetica",
                    }}
                  >
                    {cell || "—"}
                    {cellIndex === mileageIndex && row.mileageUnchanged
                      ? "  (unchanged)"
                      : ""}
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

function clipPdf(value: string, max = 160): string {
  const text = cleanCustomerLine(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function ModelExtrasBlock({ extras }: { extras: ModelExtras | null }) {
  if (!hasModelExtras(extras)) return null;
  const samples = complaintSamples(extras.complaints).slice(0, 3);
  return (
    <View style={styles.section} wrap={false}>
      <Text style={styles.sectionTitle}>{MODEL_ZONE_TITLE}</Text>
      <Text style={styles.sectionNote}>
        {MODEL_ZONE_NOTE} The {extras.ymmLabel} only.
      </Text>
      <Text style={styles.bullet}>{modelExtrasSummaryLine(extras)}</Text>
      {extras.recalls?.campaigns.map((campaign, index) => (
        <Text key={campaign.campaign} style={styles.bullet}>
          Campaign {index + 1}: {campaign.title} (NHTSA {campaign.campaign})
        </Text>
      ))}
      {samples.length > 0 && extras.complaints && (
        <Text style={styles.sectionNote}>
          Showing {samples.length} of {extras.complaints.total} owner write-ups
          for this model year — not this VIN.
        </Text>
      )}
      {samples.map((sample, index) => (
        <Text key={sample.odiNumber ?? `${index}`} style={styles.bullet}>
          {sample.date ? `${sample.date} · ` : ""}
          {sample.components}: {clipPdf(sample.summary)}
        </Text>
      ))}
    </View>
  );
}

function VehicleHeroPdf({ src }: { src: string }) {
  return (
    <View style={styles.hero}>
      <View style={styles.heroFrame}>
        {/* react-pdf Image has no alt; the caption under it is the print label. */}
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image src={src} style={styles.heroImage} />
      </View>
      <Text style={styles.heroLabel}>{HERO_ILLUSTRATION_LABEL}</Text>
    </View>
  );
}

export function ReportDocument({
  report: incoming,
  brief: incomingBrief = null,
  modelExtras: incomingExtras = null,
  heroSrc = null,
}: {
  report: VehicleReport;
  brief?: VehicleBrief | null;
  modelExtras?: ModelExtras | null;
  /** Cached (or sample) illustration. Absent when still drafting or missing. */
  heroSrc?: string | null;
}) {
  const report = cleanReport(withResolvedDispositions(incoming));
  const title = vehicleTitle(report.vehicle);
  const brief = incomingBrief ? cleanBrief(incomingBrief) : incomingBrief;
  const modelExtras = incomingExtras
    ? cleanModelExtras(incomingExtras)
    : incomingExtras;
  const flags = foundIssueChecks(report);
  const clear = searchedAndEmpty(report);
  const sections = sectionsWithRecords(report);
  const specList = headerSpecifications(report);
  const contents = reportNavItems(report, {
    modelExtras: hasModelExtras(modelExtras),
  }).map((item) => item.label);
  const odometerRollback = hasOdometerRollback(report.odometer);

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

        {/* The vehicle and its VIN are stated here and nowhere else.
            The hero is absolutely placed so a missing picture and a
            cached one share the same flow — a flex row wrapped the chips
            onto extra lines and spilled the sample onto a fourth page. */}
        <View style={heroSrc ? styles.vehicleBlockWithHero : styles.vehicleBlock}>
          <Text style={styles.vehicle}>{title}</Text>
          <Text style={styles.vin}>{prettyVin(report.vin)}</Text>
          <Chips report={report} />
          {heroSrc ? <VehicleHeroPdf src={heroSrc} /> : null}
        </View>
        {specList.length > 0 && (
          <View style={styles.headerSpecs} wrap={false}>
            <Text style={styles.metaLabel}>Specifications</Text>
            <View style={styles.specGrid}>
              {specList.map((spec, index) => (
                <View key={`${spec.label}-${index}`} style={styles.spec}>
                  <Text style={styles.specLabel}>{spec.label}</Text>
                  <Text>{spec.value}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
        <View style={styles.metaRow}>
          <Meta label="Generated" value={formatGeneratedAt(report.generatedAt)} />
        </View>
        <Text style={styles.contents}>In this report: {contents.join("  ·  ")}</Text>

        <View style={[styles.summary, { marginTop: 16 }]}>
          <Text>{report.headline}</Text>
        </View>

        <Brief report={report} brief={brief} flags={flags} clear={clear} />

        {sections.map((section) => (
          <Section
            key={section.key}
            section={section}
            odometerRollback={section.key === "titles" && odometerRollback}
          />
        ))}

        <ModelExtrasBlock extras={modelExtras} />

        <View style={styles.footer} fixed>
          <Text>
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
export function reportPdfFilename(vin: string, sample = false): string {
  const id = normalizeVin(vin).replace(/[^A-Z0-9]/g, "");
  return sample ? `${BRAND.name}-SAMPLE-${id}.pdf` : `${BRAND.name}-${id}.pdf`;
}

export async function renderReportPdf(
  report: VehicleReport,
  brief: VehicleBrief | null = null,
  modelExtras: ModelExtras | null = null,
  heroSrc: string | null = null,
): Promise<Buffer> {
  try {
    return await renderToBuffer(
      <ReportDocument
        report={report}
        brief={brief}
        modelExtras={modelExtras}
        heroSrc={heroSrc}
      />,
    );
  } catch (error) {
    if (!heroSrc) throw error;
    console.error("[pdf] hero embed failed — rendering without it", error);
    return renderToBuffer(
      <ReportDocument report={report} brief={brief} modelExtras={modelExtras} />,
    );
  }
}
