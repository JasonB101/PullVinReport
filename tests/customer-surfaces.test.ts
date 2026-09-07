import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Guards the decision that a buyer never reads the name of the company we buy
 * records from. It is the kind of thing that creeps back one helpful sentence
 * at a time, so the rule is enforced against the files rather than trusted to
 * review.
 */
/**
 * Matches the supplier as a word a customer could read, not as part of an
 * identifier (`isVinAuditConfigured`) or an import path (`@/lib/vinaudit`),
 * both of which are internals the rule was never about.
 */
const SUPPLIER = /(?<![\w/])vinaudit(?!\w)/i;

const SRC = fileURLToPath(new URL("../src/", import.meta.url));

/**
 * Where naming the supplier is legitimate.
 *
 * Operator surfaces need it to say which dependency is down; the privacy
 * policy names it because a data processor has to be disclosed; and the
 * modules that talk to it are named after it.
 */
const ALLOWED = [
  "app/admin/",
  "app/status/",
  "app/privacy/",
  "app/api/checkout/route.ts",
  "lib/config.ts",
  "lib/fulfillment.ts",
  "lib/status.ts",
  "lib/vinaudit.ts",
  "lib/report.ts",
  "lib/store/types.ts",
];

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return /\.tsx?$/.test(entry.name) ? [full] : [];
    }),
  );
  return files.flat();
}

describe("customer-facing surfaces", () => {
  it("never name the company we buy records from", async () => {
    const offenders: string[] = [];

    for (const file of await sourceFiles(SRC)) {
      const relative = path.relative(SRC, file).replaceAll(path.sep, "/");
      if (ALLOWED.some((allowed) => relative.startsWith(allowed))) continue;

      const contents = await readFile(file, "utf8");
      for (const [index, line] of contents.split("\n").entries()) {
        if (SUPPLIER.test(line)) offenders.push(`${relative}:${index + 1}`);
      }
    }

    assert.deepEqual(
      offenders,
      [],
      `these files are customer-facing and must not name the supplier:\n${offenders.join("\n")}`,
    );
  });

  it("keeps the operator surfaces that do name it", async () => {
    // The point of the rule is that the name is hidden from buyers, not
    // scrubbed from the codebase — an operator still has to be able to tell
    // which dependency is failing.
    const status = await readFile(path.join(SRC, "lib/status.ts"), "utf8");
    assert.match(status, SUPPLIER);
  });
});
