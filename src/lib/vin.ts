/**
 * VIN parsing helpers.
 *
 * Format validation is strict (17 characters, no I/O/Q) because a malformed VIN
 * can never produce a report. The ISO 3779 check digit is reported separately
 * as a warning: it is only mandatory for North American vehicles, so plenty of
 * legitimate imported VINs fail it.
 */

export const VIN_LENGTH = 17;

const TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
  "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
};

const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export function normalizeVin(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase();
}

export type VinValidation = {
  vin: string;
  valid: boolean;
  error?: string;
  /** Set when the format is fine but the ISO 3779 check digit does not match. */
  warning?: string;
};

export function checkDigitMatches(vin: string): boolean {
  let sum = 0;
  for (let i = 0; i < VIN_LENGTH; i += 1) {
    const value = TRANSLITERATION[vin[i]];
    if (value === undefined) return false;
    sum += value * WEIGHTS[i];
  }
  const remainder = sum % 11;
  const expected = remainder === 10 ? "X" : String(remainder);
  return vin[8] === expected;
}

export function validateVin(input: string): VinValidation {
  const vin = normalizeVin(input ?? "");

  if (vin.length === 0) {
    return { vin, valid: false, error: "Enter a VIN to continue." };
  }
  if (vin.length !== VIN_LENGTH) {
    return {
      vin,
      valid: false,
      error: `A VIN is exactly ${VIN_LENGTH} characters — you entered ${vin.length}.`,
    };
  }
  if (/[IOQ]/.test(vin)) {
    return {
      vin,
      valid: false,
      error: "VINs never contain the letters I, O or Q. Check for a 1 or a 0.",
    };
  }
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
    return {
      vin,
      valid: false,
      error: "VINs only use letters and numbers — remove any other characters.",
    };
  }
  if (!checkDigitMatches(vin)) {
    return {
      vin,
      valid: true,
      warning:
        "This VIN's check digit doesn't match. That's normal for some imported vehicles, but double-check it before paying.",
    };
  }
  return { vin, valid: true };
}

/** Formats a VIN for display in groups that are easy to read back aloud. */
export function prettyVin(vin: string): string {
  const v = normalizeVin(vin);
  if (v.length !== VIN_LENGTH) return v;
  return `${v.slice(0, 3)} ${v.slice(3, 8)} ${v.slice(8, 9)} ${v.slice(9)}`;
}

/** Masks all but the last 6 characters, for admin lists and logs. */
export function maskVin(vin: string): string {
  const v = normalizeVin(vin);
  if (v.length <= 6) return v;
  return `${"•".repeat(v.length - 6)}${v.slice(-6)}`;
}

/** The 10th VIN character encodes the model year for 1980+ vehicles. */
const YEAR_CODES = "ABCDEFGHJKLMNPRSTVWXY123456789";

export function modelYearFromVin(vin: string): number | undefined {
  const v = normalizeVin(vin);
  if (v.length !== VIN_LENGTH) return undefined;
  const index = YEAR_CODES.indexOf(v[9]);
  if (index === -1) return undefined;
  const currentYear = new Date().getUTCFullYear();
  // The code cycles every 30 years; pick the most recent plausible year.
  let year = 1980 + index;
  while (year + 30 <= currentYear + 1) year += 30;
  return year;
}
