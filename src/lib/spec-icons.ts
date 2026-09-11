import type { SpecGroupKey, SpecMpgKind } from "@/lib/report";

/**
 * Stroke paths for the light Vehicle specifications icon pass.
 *
 * Shared by the HTML spec sheet and the PDF so the same marks print in
 * both copies. Decorative only — every icon sits next to a text label.
 */
export type SpecIconName = SpecGroupKey | SpecMpgKind;

export const SPEC_ICON_PATHS: Record<SpecIconName, string[]> = {
  powertrain: [
    "M6 10h12v7H6z",
    "M8 10V8h2v2",
    "M14 10V8h2v2",
    "M5 13.5h14",
    "M8.5 17v2",
    "M15.5 17v2",
  ],
  body: [
    "M3.5 16.5h17l-.8-4.6a1.6 1.6 0 0 0-1-1.3l-1.5-.55-1.2-2.4A1.7 1.7 0 0 0 14.4 6.5H9.6a1.7 1.7 0 0 0-1.5.95l-1.2 2.4-1.5.55a1.6 1.6 0 0 0-1 1.3Z",
    "M7 13.8h1.6",
    "M15.4 13.8H17",
  ],
  features: [
    "M14.7 6.3a4 4 0 0 0-5.65 5.66L4 17v3h3l5.04-5.05A4 4 0 0 0 17.7 9.3L14.7 6.3z",
    "M16 8l1.5 1.5",
  ],
  price: [
    "M12.4 3H3v9.4l8.6 8.6a2.1 2.1 0 0 0 3 0l6.4-6.4a2.1 2.1 0 0 0 0-3Z",
    "M7.2 8.2h.01",
  ],
  more: ["M8 6h13", "M8 12h13", "M8 18h13", "M3 6h1.5", "M3 12h1.5", "M3 18h1.5"],
  city: [
    "M4 20V10h5v10",
    "M9 20V6h6v14",
    "M15 20V12h5v8",
    "M3 20h18",
    "M6 13h1",
    "M6 16h1",
    "M11.5 9h1",
    "M11.5 12h1",
    "M11.5 15h1",
  ],
  highway: ["M3 18h18", "M6.5 18 10 7h4l3.5 11", "M12 9.5v1.8", "M12 13.5v1.8"],
  combined: ["M5 16.5a8 8 0 1 1 14 0", "M12 16.5V11"],
};

export function specIconPaths(name: string): string[] | null {
  if (name in SPEC_ICON_PATHS) {
    return SPEC_ICON_PATHS[name as SpecIconName];
  }
  return null;
}
