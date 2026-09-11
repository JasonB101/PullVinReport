/**
 * Turns provider/NHTSA/model text into something a buyer can read.
 *
 * Listing copy and government narratives sometimes arrive with `<br>`,
 * `</br>`, escaped `&lt;br&gt;`, or leftover markdown. React text nodes
 * print those tags literally — especially visible on the phone cards,
 * where a description is no longer hidden in a wide table cell. This is
 * the single cleaner every customer surface runs through. It never
 * interprets markup as HTML.
 */

import type { VehicleBrief } from "@/lib/ai-brief";
import type { ModelExtras } from "@/lib/model-extras";
import type { Field, VehicleReport } from "@/lib/report";

const BREAK_TAG = /<\s*\/?\s*br\s*\/?\s*>/gi;
const BLOCK_OPEN = /<\s*(p|div|li|h[1-6]|tr|blockquote)(?:\s[^>]*)?>/gi;
const BLOCK_CLOSE = /<\s*\/\s*(p|div|li|h[1-6]|tr|blockquote)\s*>/gi;
const ANY_TAG = /<\/?[a-z][^>]*>/gi;

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&#(\d+);/g, (_, digits: string) => {
      const code = Number(digits);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function stripLightMarkdown(value: string): string {
  return value
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

/**
 * Strips leaked markup from a customer-visible string.
 *
 * Break tags become newlines; remaining tags are dropped; common HTML
 * entities (including one extra encode pass) are decoded. Whitespace on
 * each line is collapsed so a feed's padding does not survive.
 */
export function cleanCustomerText(value: string): string {
  let text = value;
  text = decodeEntities(decodeEntities(text));
  text = text.replace(BREAK_TAG, "\n");
  text = text.replace(BLOCK_CLOSE, "\n");
  text = text.replace(BLOCK_OPEN, "");
  text = text.replace(ANY_TAG, "");
  text = stripLightMarkdown(text);
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Same cleaner, with remaining line breaks folded to spaces. */
export function cleanCustomerLine(value: string): string {
  return cleanCustomerText(value).replace(/\s+/g, " ").trim();
}

export function cleanField<T extends { value: string }>(field: T): T {
  return { ...field, value: cleanCustomerText(field.value) };
}

export function cleanStringList(items: string[]): string[] {
  return items.map(cleanCustomerText).filter((item) => item.length > 0);
}

export function cleanBrief(brief: VehicleBrief): VehicleBrief {
  return {
    ...brief,
    fromReport: cleanStringList(brief.fromReport),
    commonForModel: cleanStringList(brief.commonForModel),
    questions: cleanStringList(brief.questions),
  };
}

export function cleanModelExtras(extras: ModelExtras): ModelExtras {
  return {
    ...extras,
    recalls: extras.recalls
      ? {
          ...extras.recalls,
          campaigns: extras.recalls.campaigns.map((campaign) => ({
            ...campaign,
            title: cleanCustomerLine(campaign.title),
            ...(campaign.consequence
              ? { consequence: cleanCustomerLine(campaign.consequence) }
              : {}),
            ...(campaign.remedy
              ? { remedy: cleanCustomerLine(campaign.remedy) }
              : {}),
            ...(campaign.takataNote
              ? { takataNote: cleanCustomerLine(campaign.takataNote) }
              : {}),
          })),
        }
      : extras.recalls,
    complaints: extras.complaints
      ? {
          ...extras.complaints,
          themes: extras.complaints.themes.map((theme) => ({
            ...theme,
            component: cleanCustomerLine(theme.component),
          })),
          samples: extras.complaints.samples.map((sample) => ({
            ...sample,
            summary: cleanCustomerLine(sample.summary),
            components: cleanCustomerLine(sample.components),
          })),
        }
      : extras.complaints,
    safetyRatings: extras.safetyRatings
      ? {
          ...extras.safetyRatings,
          ...(extras.safetyRatings.vehicleDescription
            ? {
                vehicleDescription: cleanCustomerLine(
                  extras.safetyRatings.vehicleDescription,
                ),
              }
            : {}),
        }
      : extras.safetyRatings,
  };
}

/**
 * Walks a finished report so a stored order or the sample cannot leak
 * markup that slipped past ingest — sample and paid stay on one path.
 */
export function cleanReport(report: VehicleReport): VehicleReport {
  const field = (entry: Field): Field => cleanField(entry);
  return {
    ...report,
    headline: cleanCustomerText(report.headline),
    specifications: report.specifications.map(field),
    checks: report.checks.map((check) => ({
      ...check,
      label: cleanCustomerLine(check.label),
      detail: cleanCustomerText(check.detail),
    })),
    sections: report.sections.map((section) => ({
      ...section,
      title: cleanCustomerLine(section.title),
      description: cleanCustomerText(section.description),
      emptyLabel: cleanCustomerLine(section.emptyLabel),
      ...(section.navLabel
        ? { navLabel: cleanCustomerLine(section.navLabel) }
        : {}),
      shared: section.shared?.map(field),
      records: section.records.map((record) => record.map(field)),
    })),
  };
}
