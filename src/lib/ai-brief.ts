/**
 * The plain-English brief that sits at the top of a paid report.
 *
 * Two things a buyer wants that a table cannot give them: what this particular
 * report adds up to, and what tends to go wrong on this model. They are kept
 * strictly apart — the first is written only from the records on the order, the
 * second is general knowledge about the year/make/model and is labelled as such
 * everywhere it appears. A model that blurs the two would be telling a buyer
 * their car has a problem we have no record of, so the prompt forbids it and the
 * code re-checks the output afterwards.
 *
 * Everything here fails soft. No key, a timeout, a refusal or unparsable output
 * all end the same way: no brief, and a report that reads exactly as it did
 * before the brief existed.
 */
import { anthropic, isAnthropicConfigured } from "@/lib/config";
import type {
  Listing,
  ListingGroup,
  VehicleReport,
  VehicleSummary,
} from "@/lib/report";
import {
  hasOdometerRollback,
  listingSeller,
  sectionListingGroups,
  vehicleTitle,
  withResolvedDispositions,
} from "@/lib/report";

export type VehicleBrief = {
  /** Bullets written only from the records on this order. */
  fromReport: string[];
  /** Known trouble spots for the year/make/model. Never claimed of this VIN. */
  commonForModel: string[];
  /** Things worth asking the seller, following from the two lists above. */
  questions: string[];
  /** Which model wrote it, so support can reproduce a complaint. */
  model: string;
};

/* -------------------------------------------------------------------------- */
/* What the model is allowed to see                                            */
/* -------------------------------------------------------------------------- */

const MAX_ROWS_PER_SECTION = 25;
const MAX_ODOMETER_ROWS = 30;
const MAX_SPECIFICATIONS = 12;
const MAX_VALUE_LENGTH = 120;

export type BriefSaleGroup = {
  price: string;
  date: string;
  location: string;
  headline: string;
  listingCount: number;
  channels: string[];
  sellers: string[];
  listings: string[];
};

export type BriefFacts = {
  vehicle: string;
  /**
   * Year, make and model only — the string every model-level bullet must use.
   * `unknown` when we cannot name one, in which case commonForModel stays empty.
   */
  yearMakeModel: string;
  specifications: string[];
  checks: { check: string; result: string }[];
  odometer: string[];
  odometerDirection: "consistent" | "a lower reading follows a higher one" | "unknown";
  /**
   * Sales and listing history, already grouped into listing chapters.
   * Null when the feed sent no listings — the brief must not invent any.
   * Groups are facts only: dates, totals, labels, locations, explicit status.
   */
  sales: { groups: BriefSaleGroup[]; notes: string[] } | null;
  records: { section: string; rows: string[] }[];
};

function clip(value: string): string {
  return value.length <= MAX_VALUE_LENGTH
    ? value
    : `${value.slice(0, MAX_VALUE_LENGTH - 1)}…`;
}

/**
 * Flattens a report into the few hundred tokens worth sending.
 *
 * Deliberately narrow: the VIN, the buyer, the order and the stored provider
 * payload are all left behind. What goes out is the same summary a reader sees
 * on the page, which is the only thing the brief is allowed to be about.
 */
/**
 * Year, make and model — not the trim.
 *
 * The brief is allowed to talk about this and only this. A sibling (Legacy
 * for an Outback, Camry for an Avalon) is a different car.
 */
export function exactYearMakeModel(vehicle: VehicleSummary): string {
  const parts = [vehicle.year, vehicle.make, vehicle.model]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return parts.length === 3 ? parts.join(" ") : "";
}

function listingField(listing: Listing, label: string): string {
  return (
    listing.summary.find((field) => field.label === label)?.value ??
    listing.detail.find((field) => field.label === label)?.value ??
    ""
  );
}

function listingLine(listing: Listing): string {
  const sellers = [listingField(listing, "Seller type"), listingSeller(listing)]
    .filter(Boolean)
    .join(" / ");
  return [
    listing.date,
    listing.headline,
    listing.price,
    listingField(listing, "Location"),
    listingField(listing, "Source"),
    listingField(listing, "Status"),
    listingField(listing, "Result"),
    sellers,
  ]
    .filter((part) => part.length > 0)
    .join(" · ");
}

function saleGroupFact(group: ListingGroup): BriefSaleGroup {
  const channels = [...new Set(group.listings.map((listing) => listing.headline))];
  const sellers = [
    ...new Set(
      group.listings
        .flatMap((listing) => [
          listingField(listing, "Seller type"),
          listingSeller(listing),
        ])
        .filter((value) => value.length > 0),
    ),
  ];
  return {
    price: group.price,
    date: group.date,
    location: group.location,
    headline: group.identity,
    listingCount: group.listings.length,
    channels,
    sellers,
    listings: group.listings.map(listingLine),
  };
}

/**
 * Observable notes only. Never a campaign, a re-list or a failed sale.
 *
 * A later lower total used to be written here as if the car had not sold.
 * That is not what a listing feed records, so it is not a note.
 */
function salePatterns(groups: ListingGroup[]): string[] {
  const notes: string[] = [];
  for (const group of groups) {
    if (group.listings.length > 1 && group.price) {
      if (group.price.includes("–")) {
        const [low, high] = group.price.split("–");
        notes.push(
          `${group.listings.length} listing rows show asking totals from ${low} to ${high}`,
        );
      } else {
        notes.push(
          `${group.listings.length} listing rows show the ${group.price} total`,
        );
      }
    }
  }
  return notes;
}

function briefSales(report: VehicleReport): BriefFacts["sales"] {
  const section = report.sections.find(
    (entry) => entry.key === "sales" && entry.records.length > 0,
  );
  if (!section) return null;
  const groups = sectionListingGroups(section);
  return {
    groups: groups.map(saleGroupFact),
    notes: salePatterns(groups),
  };
}

export function briefFacts(incoming: VehicleReport): BriefFacts {
  const report = withResolvedDispositions(incoming);
  return {
    vehicle: vehicleTitle(report.vehicle),
    yearMakeModel: exactYearMakeModel(report.vehicle) || "unknown",
    specifications: report.specifications
      .slice(0, MAX_SPECIFICATIONS)
      .map((spec) => `${spec.label}: ${clip(spec.value)}`),
    checks: report.checks.map((check) => ({
      check: check.label,
      result:
        check.status === "found"
          ? `${check.count} record${check.count === 1 ? "" : "s"}`
          : "nothing on file",
    })),
    odometer: report.odometer
      .slice(-MAX_ODOMETER_ROWS)
      .map(
        (reading) =>
          `${reading.date}: ${reading.value.toLocaleString("en-US")} ${reading.unit}${
            reading.source ? ` (${reading.source})` : ""
          }`,
      ),
    odometerDirection:
      report.odometer.length === 0
        ? "unknown"
        : hasOdometerRollback(report.odometer)
          ? "a lower reading follows a higher one"
          : "consistent",
    sales: briefSales(report),
    records: report.sections
      .filter((section) => section.records.length > 0 && section.layout !== "listings")
      .map((section) => ({
        section: section.title,
        rows: [
          ...(section.shared && section.shared.length > 0
            ? [
                `every record: ${section.shared
                  .map((field) => `${field.label} ${clip(field.value)}`)
                  .join(", ")}`,
              ]
            : []),
          ...section.records
            .slice(0, MAX_ROWS_PER_SECTION)
            .map((record) =>
              record
                .map((field) => `${field.label} ${clip(field.value)}`)
                .join(", "),
            ),
        ],
      })),
  };
}

/* -------------------------------------------------------------------------- */
/* The prompt                                                                  */
/* -------------------------------------------------------------------------- */

const SYSTEM_PROMPT = `You write a short brief for someone who has just paid for the vehicle history report described in FACTS. They are deciding whether to buy the car. Most of them have never read a title record before.

Rules, in order of importance:
1. Never state an event, brand, mileage, date, state or owner that is not in FACTS. Do not infer events that FACTS does not record. If FACTS is thin, say the records are thin.
2. Never say or imply that a problem common to this model was found on this vehicle. The model-level list is about the model in general, not this car.
3. Never estimate a price, market value, condition grade, score or rating. That data does not exist here.
4. Never mention data providers, databases, agencies or where the records came from.
5. Never leave a trade term standing on its own. A disposition code, a claim type, a salvage yard's name, an auction house's name and a brand code mean nothing to a buyer. Say what the record is in ordinary words.
6. A report with nothing on file is good news. Say so plainly instead of manufacturing concern.
7. Plain English. No preamble, no marketing, no hedging boilerplate.
8. When FACTS include junk, salvage, rebuilt, a total loss, or a salvage auction house (Copart, IAA, Insurance Auto Auctions), never say there were no accidents, that the picture is clean, or that nothing is worrying on the accident, theft or lien fronts. Those records already mean the vehicle entered the total-loss or salvage channel — even when a separate accident row is absent. You may say no separate accident, theft or lien row appears; do not call that clean.

Explaining what a record means:

When a bullet reports a title brand, a junk, salvage or insurance-loss entry, an accident, a lien, an impound, an export or a mileage rollback, the bullet must also say — in one short clause — why that matters to someone about to hand over money. Draw on what such a record usually indicates and what it usually costs the owner. For example: a salvage yard or an insurer taking possession of a vehicle usually follows a total loss; a vehicle down that road often ends up with a salvage or rebuilt title; lenders and insurers treat a branded title differently from a clean one, and a later buyer will too; a lien that is not shown as released can mean the seller does not yet own the car outright.

Write those consequences as what usually or often happens, never as what has happened to this car. State the record, then what it usually means, then stop. Two sentences and 400 characters at the outside.

When FACTS.sales is present, include one fromReport bullet that states only observable listing facts: dates, listed totals, locations, and seller or channel labels (dealer, auction). FACTS.sales groups are listing chapters — marketplace snapshots clustered by time and dealer or region — not confirmed sales. Name an explicit Sold or TBD status only when FACTS.sales records that status. Listing feeds often repeat or vary asking totals without that meaning anything about whether the car sold or was advertised again. FORBIDDEN unless FACTS explicitly records sold vs unsold: that the car was advertised more than once, that the same car was listed twice, that it did not sell, that it didn't find a buyer, or that a later lower ask means it failed to sell. Do not invent a cause. Two rows at the same total are two rows. Cite only dates, totals, places and statuses that appear in FACTS.sales.

Records with nothing worrying in them do not need a consequence. Do not manufacture one for a routine registration renewal.

Reply with JSON and nothing else:
{"fromReport":["..."],"commonForModel":["..."],"questions":["..."]}

fromReport: 2 to 6 bullets on what this report shows — title brands or their absence, how the mileage progresses, moves between states, accidents, liens, salvage or junk entries, and the listings when FACTS.sales is present, stated as facts only. Use the actual counts, dates and listing totals from FACTS. A listing total copied from FACTS.sales is a fact, not a valuation — never estimate what the car is worth. Each bullet is at most two sentences and 400 characters.
commonForModel: 0 to 4 bullets on well-known trouble spots for the exact vehicle in FACTS.yearMakeModel. Every bullet MUST name that full year, make and model (for example "2021 Subaru Outback"). Never name a sibling or a different model — Legacy is not Outback, Camry is not Avalon, F-150 is not Expedition. Never name a different model year. If FACTS.yearMakeModel is "unknown", or you are not confident about that exact vehicle, return [].
questions: 0 to 4 short questions for the seller, each one following from a bullet above. When the report shows a brand, a salvage or junk entry or an accident, include one question that asks for the reason and the repair documentation. A junk/salvage entry and a branded title are usually the same event — do not ask for that paperwork twice. A distinct accident may have its own ask. Do not ask whether a TBD or "to be determined" status has been resolved when FACTS already record Sold (or another final salvage/auction disposition) for that event.`;

/* -------------------------------------------------------------------------- */
/* Reading the answer back                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Long enough for a record and what it means for the buyer.
 *
 * The prompt asks for 400 characters. This ceiling is a little higher so a
 * why-it-matters clause that ran on is shortened rather than thrown away —
 * dropping it used to empty fromReport and hide the whole brief.
 */
const MAX_BULLET_LENGTH = 520;

const LIMITS = { fromReport: 6, commonForModel: 4, questions: 4 } as const;

/** Claims about this specific car have no business in the model-level list. */
const VIN_CLAIM = /\b(this|the)\s+(vin|vehicle|car|truck|suv)\b/i;

/**
 * A stated amount, grade or score.
 *
 * We hold no valuation data, so nothing may put a number on this car. The
 * guard is deliberately about the number rather than the vocabulary: telling a
 * buyer that a branded title usually costs an owner at resale is true, useful
 * and exactly what the brief is for, and the earlier version of this threw
 * such a bullet away for containing the word "worth".
 */
const VALUATION_CLAIMS = [
  /\b(?:worth|market value|valued at|price of|resale value of|sells? for)\s+(?:about|around|roughly|approximately|some|up to|at least|over|under)?\s*\$?\d/i,
  /\b(?:grade|score|rating)\s+(?:of\s+)?(?:[a-f]\b|\d)/i,
];

/** Dollar amounts that are not a valuation — listing totals belong in fromReport. */
const AMOUNT_CLAIMS = [
  /\$\s?\d/,
  /\b\d[\d,]{2,}(?:\.\d+)?\s*(?:dollars|usd)\b/i,
];

/**
 * Shopping-path stories the listings feed does not support.
 *
 * Same totals and later lower asks are not a campaign, a re-list or a failed
 * sale unless the feed said so. The prompt forbids that; this is the last
 * place it can be caught.
 */
/**
 * A "clean accident picture" claim that cannot stand next to junk, salvage
 * or a Copart/IAA record. Those already mean the car entered the total-loss
 * channel, even when a separate accident row is absent.
 */
const CLEAN_ACCIDENT_FRONT = [
  /\bno accidents?\b/i,
  /\bclean picture\b/i,
  /\bnothing worrying\b/i,
  /\bclean (?:on )?(?:all )?(?:of )?those fronts\b/i,
  /\bno accident, theft, lien/i,
  /\bnothing on (?:the )?(?:accident|theft|lien)/i,
];

const SALVAGE_CHANNEL = [
  /\bjunk\b/i,
  /\bsalvage\b/i,
  /\brebuilt\b/i,
  /\btotal(?:ed|led)? loss\b/i,
  /\bcopart\b/i,
  /\binsurance auto auctions\b/i,
  /\biaa\b/i,
];

/** True when the records already put this car in the salvage / total-loss channel. */
export function factsIndicateSalvageChannel(facts: BriefFacts): boolean {
  const haystack = [
    ...facts.checks.map((check) => `${check.check} ${check.result}`),
    ...facts.records.flatMap((entry) => [entry.section, ...entry.rows]),
    ...(facts.sales
      ? [
          ...facts.sales.notes,
          ...facts.sales.groups.flatMap((group) => [
            group.headline,
            ...group.channels,
            ...group.sellers,
            ...group.listings,
          ]),
        ]
      : []),
  ].join("\n");
  return SALVAGE_CHANNEL.some((pattern) => pattern.test(haystack));
}

function dropCleanFrontWhenSalvage(fromReport: string[], salvage: boolean): string[] {
  if (!salvage) return fromReport;
  return fromReport.filter(
    (bullet) => !CLEAN_ACCIDENT_FRONT.some((pattern) => pattern.test(bullet)),
  );
}

const TBD_QUESTION =
  /\b(tbd|to be determined|to-be-determined)\b|has that status been resolved|still (?:pending|unresolved|to be determined)|disposition (?:been )?(?:resolved|updated|finalised|finalized)|what (?:does|is) tbd/i;

const PAPERWORK_ASK =
  /paperwork|receipts?|documentation|repair records?|can you show|are (?:the )?(?:receipts|records) available|reason for/i;

const SALVAGE_OR_BRAND_ASK =
  /salvage|junk|rebuilt|branded[\s-]?title|title[\s-]?brand|insurance-loss|total(?:ed|led)? loss|\bcopart\b|\biaa\b/i;

const PENDING_DISPOSITION =
  /\b(tbd|pending|undetermined)\b|to[\s-]?be[\s-]?determined/i;
const FINAL_DISPOSITION =
  /\b(sold|salvaged|crushed|destroyed|scrapped|scrap|recycled|exported)\b/i;

function salvageDispositionLines(facts: BriefFacts): string[] {
  const lines: string[] = [];
  for (const entry of facts.records) {
    if (/junk|salvage|insurance/i.test(entry.section)) {
      lines.push(...entry.rows);
    }
  }
  if (facts.sales) {
    for (const group of facts.sales.groups) {
      const blob = [group.headline, ...group.channels, ...group.listings].join(
        " ",
      );
      if (/\bcopart\b|\biaa\b|\bauction\b|\bsalvage\b|\bjunk\b/i.test(blob)) {
        lines.push(...group.listings);
      }
    }
  }
  return lines;
}

/** After TBD/Sold collapse: Sold with no leftover pending row. */
export function factsIndicateResolvedSalvageSale(facts: BriefFacts): boolean {
  const lines = salvageDispositionLines(facts);
  const sold = lines.some((line) => FINAL_DISPOSITION.test(line));
  const pending = lines.some((line) => PENDING_DISPOSITION.test(line));
  return sold && !pending;
}

/**
 * Drops resolved-TBD questions and stacked salvage/title-brand paperwork asks.
 *
 * Once FACTS already record Sold for the salvage/auction event, asking whether
 * TBD was resolved is leftover from the twin row. A junk/salvage entry and a
 * branded title are usually one event — keep the first paperwork question.
 */
export function filterSellerQuestions(
  questions: string[],
  facts?: BriefFacts,
): string[] {
  let kept = questions.filter((question) => question.trim().length > 0);

  if (facts && factsIndicateResolvedSalvageSale(facts)) {
    kept = kept.filter((question) => !TBD_QUESTION.test(question));
  }

  let sawSalvageBrandPaperwork = false;
  const out: string[] = [];
  for (const question of kept) {
    const salvagePaper =
      PAPERWORK_ASK.test(question) && SALVAGE_OR_BRAND_ASK.test(question);
    if (salvagePaper) {
      if (sawSalvageBrandPaperwork) continue;
      sawSalvageBrandPaperwork = true;
    }
    out.push(question);
  }
  return out.slice(0, LIMITS.questions);
}

const LISTING_FICTION = [
  /didn['’]t sell/i,
  /did not sell/i,
  /wouldn['’]t sell/i,
  /would not sell/i,
  /advertised more than once/i,
  /same car advertised/i,
  /same car listed/i,
  /didn['’]t find a buyer/i,
  /did not find a buyer/i,
  /listing campaign/i,
  /advertised in more than one place/i,
  /failed to sell/i,
  /re-?list(?:ed|ing)?/i,
];

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const AFTER_TOKEN = /([A-Za-z][A-Za-z0-9-]+)/;

/**
 * Words that may follow the year or the make without being a model name.
 *
 * "2021 Subaru" and "Subaru wagons" are about this car. "2021 Legacy" is not.
 */
const AFTER_YEAR_OK = new Set(["the", "this", "these", "those"]);
const AFTER_MAKE_OK = new Set([
  "vehicles",
  "models",
  "cars",
  "trucks",
  "suvs",
  "wagons",
  "sedans",
]);

/**
 * Keeps a model-level bullet only if it is about this year, make and model.
 *
 * Sonnet has written "2021 Legacy" on an Outback. The prompt forbids that;
 * this is the last place it can be caught. A bullet that never names a
 * different model is rewritten so it leads with the exact year/make/model,
 * because "this generation" without a name is how the slip starts.
 */
export function pinCommonForModel(
  bullet: string,
  vehicle: VehicleSummary,
): string | null {
  const ymm = exactYearMakeModel(vehicle);
  if (!ymm) return null;

  const year = vehicle.year?.trim() ?? "";
  const make = vehicle.make?.trim() ?? "";
  const model = vehicle.model?.trim() ?? "";
  const modelHead = model.split(/\s+/)[0] ?? "";

  for (const match of bullet.matchAll(/\b((?:19|20)\d{2})\b/g)) {
    if (match[1] !== year) return null;
  }

  const afterYear = new RegExp(
    `\\b${escapeRe(year)}\\s+${AFTER_TOKEN.source}`,
    "gi",
  );
  for (const match of bullet.matchAll(afterYear)) {
    const word = match[1];
    if (
      word.toLowerCase() !== make.toLowerCase() &&
      word.toLowerCase() !== modelHead.toLowerCase() &&
      !AFTER_YEAR_OK.has(word.toLowerCase())
    ) {
      return null;
    }
  }

  const afterMake = new RegExp(
    `\\b${escapeRe(make)}\\s+${AFTER_TOKEN.source}`,
    "gi",
  );
  for (const match of bullet.matchAll(afterMake)) {
    const word = match[1];
    if (
      word.toLowerCase() !== modelHead.toLowerCase() &&
      !AFTER_MAKE_OK.has(word.toLowerCase())
    ) {
      return null;
    }
  }

  if (new RegExp(escapeRe(ymm), "i").test(bullet)) return bullet;

  return `On the ${ymm}: ${bullet}`;
}

function clipBullet(text: string): string {
  if (text.length <= MAX_BULLET_LENGTH) return text;
  return `${text.slice(0, MAX_BULLET_LENGTH - 1)}…`;
}

function bullets(
  value: unknown,
  limit: number,
  options: { allowAmounts?: boolean; rejectListingFiction?: boolean } = {},
): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => clipBullet(entry.trim().replace(/^[-•*]\s*/, "")))
    .filter((entry) => entry.length > 0)
    .filter((entry) => !VALUATION_CLAIMS.some((pattern) => pattern.test(entry)))
    .filter(
      (entry) =>
        options.allowAmounts || !AMOUNT_CLAIMS.some((pattern) => pattern.test(entry)),
    )
    .filter(
      (entry) =>
        !options.rejectListingFiction ||
        !LISTING_FICTION.some((pattern) => pattern.test(entry)),
    )
    .slice(0, limit);
}

/**
 * Turns a model reply into a brief, or into nothing.
 *
 * The prompt asks for bare JSON; models sometimes wrap it in a fence or a
 * sentence anyway, so the outermost object is extracted rather than trusted.
 * The guards that follow are not politeness — they are the last place a claim
 * about this car can be caught before a buyer reads it as fact.
 */
export function parseBrief(
  text: string,
  model: string,
  vehicle?: VehicleSummary,
  facts?: BriefFacts,
): VehicleBrief | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const payload = parsed as Record<string, unknown>;
  const fromReport = dropCleanFrontWhenSalvage(
    bullets(payload.fromReport, LIMITS.fromReport, {
      allowAmounts: true,
      rejectListingFiction: true,
    }),
    Boolean(facts && factsIndicateSalvageChannel(facts)),
  );
  if (fromReport.length === 0) return null;

  const common = bullets(payload.commonForModel, LIMITS.commonForModel)
    .filter((bullet) => !VIN_CLAIM.test(bullet))
    .map((bullet) => (vehicle ? pinCommonForModel(bullet, vehicle) : bullet))
    .filter((bullet): bullet is string => Boolean(bullet));

  return {
    fromReport,
    commonForModel: vehicle && !exactYearMakeModel(vehicle) ? [] : common,
    questions: filterSellerQuestions(
      bullets(payload.questions, LIMITS.questions),
      facts,
    ),
    model,
  };
}

/* -------------------------------------------------------------------------- */
/* The call                                                                    */
/* -------------------------------------------------------------------------- */

type MessagesResponse = {
  content?: { type?: string; text?: string }[];
};

/** How much of a rejection is worth putting in the log. */
const MAX_ERROR_DETAIL = 500;

/**
 * Reads a rejection back for the operator's log.
 *
 * Reading the body can itself fail — a truncated response, a body already
 * consumed — and a failure to explain a failure must not become the failure
 * the caller sees.
 */
const SNIPPET = 240;

function snippet(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) return "(empty reply)";
  return trimmed.length <= SNIPPET ? trimmed : `${trimmed.slice(0, SNIPPET)}…`;
}

async function errorDetail(response: Response): Promise<string> {
  try {
    const body = (await response.text()).trim();
    if (body.length === 0) return "(empty body)";
    return body.length <= MAX_ERROR_DETAIL
      ? body
      : `${body.slice(0, MAX_ERROR_DETAIL)}… (truncated)`;
  } catch {
    return "(body could not be read)";
  }
}

/**
 * Writes the brief for a report.
 *
 * Returns `null` for every failure mode — unconfigured, timed out, rejected,
 * unparsable — because a report the buyer already paid for must never depend on
 * this call succeeding. The reason is logged for the operator instead.
 */
export async function generateBrief(
  report: VehicleReport,
  options: { timeoutMs?: number } = {},
): Promise<VehicleBrief | null> {
  if (!isAnthropicConfigured()) return null;

  const model = anthropic.model;
  // Callers on a deadline of their own — fulfillment answers a Stripe webhook
  // — can ask for less time than the page view is willing to wait.
  const timeoutMs = options.timeoutMs ?? anthropic.timeoutMs;
  const facts = briefFacts(report);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${anthropic.baseUrl}/v1/messages`, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": anthropic.apiKey as string,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        // Room for the clause that says why a record matters. At the old
        // ceiling a brief that explained itself ran out mid-sentence, and an
        // unterminated JSON string parses as nothing at all.
        max_tokens: 2_048,
        // No `temperature`. Sonnet 5 rejects the whole request with a 400 when
        // it is present, and the guards below are what keep the output in line
        // anyway — a sampling knob was never what made the brief trustworthy.
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `FACTS\n${JSON.stringify(facts, null, 1)}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      // The status alone cost an afternoon once: a 400 for an unsupported
      // parameter and a 400 for a malformed prompt look identical until you
      // read what came back. The body is the model's own error, not ours, and
      // the key never travels in it.
      console.error(
        `[brief] model returned HTTP ${response.status}: ${await errorDetail(response)}`,
      );
      return null;
    }

    const payload = (await response.json()) as MessagesResponse;
    const text = (payload.content ?? [])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text as string)
      .join("\n")
      .trim();

    const brief = parseBrief(text, model, report.vehicle, facts);
    if (!brief) {
      // The reply that failed to parse is the only way to tell a cut-off
      // JSON string from a refusal. 428 characters of unterminated JSON is
      // how we learned 20s and 1000 tokens were not enough.
      console.error(`[brief] could not read a brief out of the reply: ${snippet(text)}`);
    }
    return brief;
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? `no reply within ${timeoutMs}ms`
        : (error as Error).message;
    console.error(`[brief] not generated: ${reason}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
