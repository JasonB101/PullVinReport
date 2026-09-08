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
import type { VehicleReport } from "@/lib/report";
import { hasOdometerRollback, vehicleTitle } from "@/lib/report";

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

export type BriefFacts = {
  vehicle: string;
  specifications: string[];
  checks: { check: string; result: string }[];
  odometer: string[];
  odometerDirection: "consistent" | "a lower reading follows a higher one" | "unknown";
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
export function briefFacts(report: VehicleReport): BriefFacts {
  return {
    vehicle: vehicleTitle(report.vehicle),
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
    records: report.sections
      .filter((section) => section.records.length > 0)
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

const SYSTEM_PROMPT = `You write a short brief for someone who has just paid for the vehicle history report described in FACTS. They are deciding whether to buy the car.

Rules, in order of importance:
1. Never state an event, brand, mileage, date, state or owner that is not in FACTS. Do not infer events that FACTS does not record. If FACTS is thin, say the records are thin.
2. Never say or imply that a problem common to this model was found on this vehicle. The model-level list is about the model in general, not this car.
3. Never estimate a price, market value, condition grade, score or rating. That data does not exist here.
4. Never mention data providers, databases, agencies or where the records came from.
5. One plain-English sentence per bullet. No preamble, no marketing, no hedging boilerplate.
6. A report with nothing on file is good news. Say so plainly instead of manufacturing concern.

Reply with JSON and nothing else:
{"fromReport":["..."],"commonForModel":["..."],"questions":["..."]}

fromReport: 2 to 5 bullets on what this report shows — title brands or their absence, how the mileage progresses, moves between states, accidents, liens, salvage or junk entries. Use the actual counts and dates from FACTS.
commonForModel: 0 to 4 bullets on well-known trouble spots for this year, make and model in general. Write them as tendencies of the model. Use an empty array if the vehicle is unknown or you are not confident about it.
questions: 0 to 4 short questions for the seller, each one following from a bullet above.`;

/* -------------------------------------------------------------------------- */
/* Reading the answer back                                                     */
/* -------------------------------------------------------------------------- */

const MAX_BULLET_LENGTH = 260;
const LIMITS = { fromReport: 5, commonForModel: 4, questions: 4 } as const;

/** Claims about this specific car have no business in the model-level list. */
const VIN_CLAIM = /\b(this|the)\s+(vin|vehicle|car|truck|suv)\b/i;

/** A price, a market value or a letter grade: none of it is ours to state. */
const INVENTED_NUMBER = /\$\s?\d|\bmarket value\b|\bworth\b|\bgrade [a-f]\b|\bscore\b/i;

function bullets(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().replace(/^[-•*]\s*/, ""))
    .filter((entry) => entry.length > 0 && entry.length <= MAX_BULLET_LENGTH)
    .filter((entry) => !INVENTED_NUMBER.test(entry))
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
export function parseBrief(text: string, model: string): VehicleBrief | null {
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
  const fromReport = bullets(payload.fromReport, LIMITS.fromReport);
  if (fromReport.length === 0) return null;

  return {
    fromReport,
    commonForModel: bullets(payload.commonForModel, LIMITS.commonForModel).filter(
      (bullet) => !VIN_CLAIM.test(bullet),
    ),
    questions: bullets(payload.questions, LIMITS.questions),
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
        max_tokens: 1_000,
        // No `temperature`. Sonnet 5 rejects the whole request with a 400 when
        // it is present, and the guards below are what keep the output in line
        // anyway — a sampling knob was never what made the brief trustworthy.
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `FACTS\n${JSON.stringify(briefFacts(report), null, 1)}`,
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

    const brief = parseBrief(text, model);
    if (!brief) console.error("[brief] could not read a brief out of the reply");
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
