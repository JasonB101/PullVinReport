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
  Path,
  StyleSheet,
  Svg,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

import { presentBrief, type VehicleBrief } from "@/lib/ai-brief";
import { BRAND } from "@/lib/config";
import type { ModelExtras } from "@/lib/model-extras";
import type { ModelEv } from "@/lib/model-extras";
import type { ModelMpg } from "@/lib/model-extras";
import type { ModelOwnership } from "@/lib/model-extras";
import type { ModelSafetyRatings } from "@/lib/model-extras";
import {
  campaignBadges,
  complaintSamples,
  formatUsdEstimate,
  hasEvCard,
  hasModelExtras,
  hasOwnership,
  hasSafetyRatings,
  modelExtrasCountsLine,
  mpgFigureRows,
  recallHeaderBadges,
  safetyCategoryRows,
  safetyOverallFigure,
  youSaveSpendCopy,
} from "@/lib/model-extras";
import {
  NHTSA_STAR_MAX,
  STAR_PATH,
  nhtsaStarSlots,
} from "@/lib/safety-stars";
import { REPORT_DISCLAIMER } from "@/lib/customer-copy";
import {
  cleanBrief,
  cleanCustomerLine,
  cleanModelExtras,
  cleanReport,
} from "@/lib/customer-text";
import {
  COMMON_FOR_MODEL,
  EPA_EV_NOTE,
  EPA_EV_TITLE,
  EPA_MPG_NOTE,
  EPA_MPG_TITLE,
  EPA_OWNERSHIP_NOTE,
  EPA_OWNERSHIP_TITLE,
  FROM_THIS_VIN,
  SAFETY_RATINGS_NOTE,
  SAFETY_RATINGS_TITLE,
  SPEC_MPG_NOTE,
  SPEC_MPG_TITLE,
  MODEL_ZONE_NOTE,
  MODEL_ZONE_TITLE,
  QUESTIONS_HEADING,
  THIS_VIN_CHIP,
  VIN_SPECS_NOTE,
  VIN_SPECS_TITLE,
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
  groupSpecFields,
  headerSpecifications,
  partitionSpecMpg,
  specMeasureFigures,
  issueChecksEmptyLabel,
  reportChips,
  reportHeadline,
  reportNavItems,
  searchedAndEmpty,
  sectionListingGroups,
  sectionTable,
  sectionsWithRecords,
  vehicleTitle,
  withResolvedDispositions,
} from "@/lib/report";
import { reportHealth } from "@/lib/report-health";
import { specIconPaths } from "@/lib/spec-icons";
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

  headerSpecs: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: "#f8fafc",
    borderRadius: 4,
    padding: 8,
  },
  specHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  specTitle: { fontFamily: "Helvetica-Bold", fontSize: 9 },
  specChip: {
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    paddingVertical: 1,
    paddingHorizontal: 5,
    fontSize: 6.5,
    color: MUTED,
  },
  specNote: { color: MUTED, fontSize: 7, marginBottom: 6 },
  specMpgHeading: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: INK,
    marginBottom: 2,
  },
  specGroup: {
    marginTop: 7,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: "#ffffff",
    borderRadius: 3,
    overflow: "hidden",
  },
  specGroupHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingTop: 5,
    paddingBottom: 3,
  },
  specGroupTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: INK,
  },
  specMeasureRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 6,
    paddingBottom: 5,
  },
  specMeasure: { minWidth: 56 },
  specMeasureValue: { fontFamily: "Helvetica-Bold", fontSize: 9 },
  specMeasureLabel: { fontSize: 7, color: MUTED, marginTop: 1 },
  specRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingVertical: 3.5,
    paddingHorizontal: 6,
  },
  specCell: { width: "50%", paddingRight: 8 },
  specRowLabel: { fontSize: 7, color: MUTED },
  specRowValue: { fontFamily: "Helvetica-Bold", fontSize: 8, marginTop: 1 },
  mpgRow: { flexDirection: "row", gap: 6, marginTop: 4 },
  mpgCard: {
    width: 72,
    borderWidth: 1,
    borderColor: "#fde68a",
    backgroundColor: "#fffbeb",
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignItems: "center",
  },
  specMpgCard: {
    width: 78,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    borderRadius: 4,
    paddingVertical: 7,
    paddingHorizontal: 4,
    alignItems: "center",
  },
  mpgCardCombined: {
    borderColor: "#f59e0b",
    backgroundColor: "#fffbeb",
  },
  mpgValue: { fontFamily: "Helvetica-Bold", fontSize: 16 },
  mpgUnit: { fontSize: 6.5, color: FAINT, marginTop: 1 },
  mpgLabel: {
    fontSize: 6.5,
    color: MUTED,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: 1,
  },

  safetyOverall: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#bae6fd",
    backgroundColor: "#ffffff",
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginTop: 2,
  },
  safetyOverallCopy: { flexGrow: 1 },
  safetyStars: { flexDirection: "row", gap: 1.5 },
  safetyScore: { fontFamily: "Helvetica-Bold", fontSize: 16 },
  safetyScoreDenom: { fontSize: 8, color: MUTED },
  safetyCategoryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 3.5,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  safetyCategoryLabel: { fontSize: 8, color: INK },

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
  emptyLabel,
}: {
  flags: ReportCheck[];
  clear: string[];
  emptyLabel: string;
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
        <Text style={styles.sectionNote}>{emptyLabel}</Text>
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
        <Findings
          flags={flags}
          clear={clear}
          emptyLabel={issueChecksEmptyLabel(report)}
        />
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

function chunkFields<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

function PdfSpecIcon({
  name,
  size = 8,
}: {
  name: string;
  size?: number;
}) {
  const paths = specIconPaths(name);
  if (!paths) return null;
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      {paths.map((d) => (
        <Path
          key={d}
          d={d}
          stroke={MUTED}
          strokeWidth={1.7}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}

function SpecGroupPdf({
  group,
}: {
  group: { key: string; title: string; fields: Field[] };
}) {
  const { measures, rest } = specMeasureFigures(group.fields);
  if (measures.length === 0 && rest.length === 0) return null;

  return (
    <View style={styles.specGroup} wrap={false}>
      <View style={styles.specGroupHead}>
        <PdfSpecIcon name={group.key} />
        <Text style={styles.specGroupTitle}>{group.title}</Text>
      </View>
      {measures.length > 0 ? (
        <View style={styles.specMeasureRow}>
          {measures.map((row) => (
            <View key={row.key} style={styles.specMeasure}>
              <Text style={styles.specMeasureValue}>{row.display}</Text>
              <Text style={styles.specMeasureLabel}>{row.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {chunkFields(rest, 2).map((pair, index) => (
        <View key={index} style={styles.specRow}>
          {pair.map((spec) => (
            <View key={spec.label} style={styles.specCell}>
              <Text style={styles.specRowLabel}>{spec.label}</Text>
              <Text style={styles.specRowValue}>{spec.value}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function SpecMpgFigures({
  figures,
}: {
  figures: { key: string; label: string; display: string }[];
}) {
  return (
    <View wrap={false}>
      <Text style={styles.specMpgHeading}>{SPEC_MPG_TITLE}</Text>
      <View style={styles.mpgRow}>
        {figures.map((row) => (
          <View key={row.key} style={styles.specMpgCard}>
            <PdfSpecIcon name={row.key} size={7} />
            <Text style={styles.mpgValue}>{row.display}</Text>
            <Text style={styles.mpgLabel}>{row.label}</Text>
            <Text style={styles.mpgUnit}>mpg</Text>
          </View>
        ))}
      </View>
      <Text style={styles.caveat}>{SPEC_MPG_NOTE}</Text>
    </View>
  );
}

function EpaMpgFigures({ mpg, unit = "mpg" }: { mpg: ModelMpg; unit?: string }) {
  return (
    <View wrap={false}>
      <Text style={styles.briefHeading}>{EPA_MPG_TITLE.toUpperCase()}</Text>
      <View style={styles.mpgRow}>
        {mpgFigureRows(mpg).map((row) => (
          <View
            key={row.key}
            style={[
              styles.mpgCard,
              row.key === "combined" ? styles.mpgCardCombined : {},
            ]}
          >
            <Text style={styles.mpgValue}>{row.value}</Text>
            <Text style={styles.mpgLabel}>
              {row.label} {unit}
            </Text>
          </View>
        ))}
      </View>
      <Text style={styles.caveat}>
        {mpg.fuelType ? `${mpg.fuelType}. ` : ""}
        {EPA_MPG_NOTE}
      </Text>
    </View>
  );
}

function PdfStar({ filled, size = 9 }: { filled: boolean; size?: number }) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Path d={STAR_PATH} fill={filled ? INK : "#e2e8f0"} />
    </Svg>
  );
}

function PdfStarRow({ rating, size = 9 }: { rating: number; size?: number }) {
  return (
    <View style={styles.safetyStars}>
      {nhtsaStarSlots(rating).map((filled, index) => (
        <PdfStar key={index} filled={filled} size={size} />
      ))}
    </View>
  );
}

function SafetyRatingsBlock({ ratings }: { ratings: ModelSafetyRatings }) {
  const overall = safetyOverallFigure(ratings);
  const categories = safetyCategoryRows(ratings);
  if (!overall && categories.length === 0) return null;
  return (
    <View wrap={false}>
      <Text style={styles.briefHeading}>{SAFETY_RATINGS_TITLE.toUpperCase()}</Text>
      {overall ? (
        <View style={styles.safetyOverall}>
          <View style={styles.safetyOverallCopy}>
            <Text style={styles.mpgLabel}>{overall.label}</Text>
            <View style={{ marginTop: 3 }}>
              <PdfStarRow rating={overall.value} size={11} />
            </View>
          </View>
          <Text style={styles.safetyScore}>
            {overall.value}
            <Text style={styles.safetyScoreDenom}>/{NHTSA_STAR_MAX}</Text>
          </Text>
        </View>
      ) : null}
      {categories.map((row) => (
        <View key={row.key} style={styles.safetyCategoryRow}>
          <Text style={styles.safetyCategoryLabel}>{row.label}</Text>
          <PdfStarRow rating={row.value} size={8} />
        </View>
      ))}
      <Text style={styles.caveat}>
        {ratings.vehicleDescription ? `${ratings.vehicleDescription}. ` : ""}
        {SAFETY_RATINGS_NOTE}
      </Text>
    </View>
  );
}

function OwnershipBlock({ ownership }: { ownership: ModelOwnership }) {
  const bits: string[] = [];
  if (ownership.annualFuelCost !== undefined) {
    bits.push(
      `Annual fuel cost (estimate) ${formatUsdEstimate(ownership.annualFuelCost)}`,
    );
  }
  if (ownership.youSaveSpend !== undefined) {
    bits.push(`${youSaveSpendCopy(ownership.youSaveSpend)} (estimate)`);
  }
  if (ownership.feScore !== undefined) bits.push(`Fuel economy score ${ownership.feScore}/10`);
  if (ownership.ghgScore !== undefined) bits.push(`GHG score ${ownership.ghgScore}/10`);
  if (ownership.co2 !== undefined) {
    bits.push(`Tailpipe CO2 ${ownership.co2.toLocaleString("en-US")} g/mi`);
  }
  if (bits.length === 0) return null;
  return (
    <View wrap={false}>
      <Text style={styles.briefHeading}>{EPA_OWNERSHIP_TITLE.toUpperCase()}</Text>
      <Text style={styles.bullet}>{bits.join("  ·  ")}</Text>
      <Text style={styles.caveat}>{EPA_OWNERSHIP_NOTE}</Text>
    </View>
  );
}

function EvBlock({ ev }: { ev: ModelEv }) {
  const bits: string[] = [ev.kind === "PHEV" ? "Plug-in hybrid" : "Electric"];
  if (ev.range !== undefined) {
    bits.push(
      `${ev.kind === "PHEV" ? "Electric range" : "Range"} ${ev.range.toLocaleString("en-US")} mi`,
    );
  }
  if (ev.charge240 !== undefined) bits.push(`Charge at 240V ${ev.charge240} hr`);
  if (ev.charge120 !== undefined) bits.push(`Charge at 120V ${ev.charge120} hr`);
  if (ev.batteryKwh !== undefined) bits.push(`Battery ${ev.batteryKwh} kWh`);
  if (ev.mpge) {
    bits.push(
      `${ev.mpge.city} city / ${ev.mpge.highway} hwy / ${ev.mpge.combined} combined MPGe`,
    );
  }
  return (
    <View wrap={false}>
      <Text style={styles.briefHeading}>{EPA_EV_TITLE.toUpperCase()}</Text>
      <Text style={styles.bullet}>{bits.join("  ·  ")}</Text>
      <Text style={styles.caveat}>{EPA_EV_NOTE}</Text>
    </View>
  );
}

function ModelExtrasBlock({ extras }: { extras: ModelExtras | null }) {
  if (!hasModelExtras(extras)) return null;
  const samples = complaintSamples(extras.complaints).slice(0, 3);
  const counts = modelExtrasCountsLine(extras);
  return (
    <View style={styles.section} wrap>
      <View minPresenceAhead={96} wrap={false}>
        <Text style={styles.sectionTitle}>{MODEL_ZONE_TITLE}</Text>
        <Text style={styles.sectionNote}>
          {MODEL_ZONE_NOTE} The {extras.ymmLabel} only.
        </Text>
        {counts ? <Text style={styles.bullet}>{counts}</Text> : null}
      </View>
      {hasSafetyRatings(extras.safetyRatings) ? (
        <SafetyRatingsBlock ratings={extras.safetyRatings} />
      ) : null}
      {extras.recalls && recallHeaderBadges(extras.recalls).length > 0 ? (
        <Text style={styles.bullet}>
          NHTSA flags:{" "}
          {recallHeaderBadges(extras.recalls)
            .map((badge) => badge.label)
            .join(" · ")}
        </Text>
      ) : null}
      {extras.recalls?.campaigns.map((campaign, index) => {
        const badges = campaignBadges(campaign);
        const flag = badges.length
          ? ` [${badges.map((badge) => badge.label).join(", ")}]`
          : "";
        return (
          <Text key={campaign.campaign} style={styles.bullet}>
            Campaign {index + 1}: {campaign.title} (NHTSA {campaign.campaign})
            {flag}
          </Text>
        );
      })}
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
      {hasEvCard(extras.ev) ? (
        <EvBlock ev={extras.ev} />
      ) : extras.mpg ? (
        <EpaMpgFigures mpg={extras.mpg} />
      ) : null}
      {hasOwnership(extras.ownership) ? (
        <OwnershipBlock ownership={extras.ownership} />
      ) : null}
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
  const brief = incomingBrief
    ? presentBrief(cleanBrief(incomingBrief), report)
    : incomingBrief;
  const modelExtras = incomingExtras
    ? cleanModelExtras(incomingExtras)
    : incomingExtras;
  const flags = foundIssueChecks(report);
  const clear = searchedAndEmpty(report);
  const sections = sectionsWithRecords(report);
  const specList = headerSpecifications(report);
  const { mpg: specMpg, rest: specRest } = partitionSpecMpg(specList);
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
          <View style={styles.headerSpecs}>
            <View style={styles.specHead} wrap={false} minPresenceAhead={72}>
              <Text style={styles.specTitle}>{VIN_SPECS_TITLE}</Text>
              <Text style={styles.specChip}>{THIS_VIN_CHIP}</Text>
            </View>
            <Text style={styles.specNote}>{VIN_SPECS_NOTE}</Text>
            {specMpg ? <SpecMpgFigures figures={specMpg.figures} /> : null}
            {groupSpecFields(specRest).map((group) => (
              <SpecGroupPdf key={group.key} group={group} />
            ))}
          </View>
        )}
        <View style={styles.metaRow}>
          <Meta label="Generated" value={formatGeneratedAt(report.generatedAt)} />
        </View>
        <Text style={styles.contents}>In this report: {contents.join("  ·  ")}</Text>

        <View style={[styles.summary, { marginTop: 16 }]}>
          <Text>{reportHeadline(report)}</Text>
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
  return sample
    ? `${BRAND.filePrefix}-SAMPLE-${id}.pdf`
    : `${BRAND.filePrefix}-${id}.pdf`;
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
