import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import ts from "typescript";

/**
 * Module hooks that let the Node test runner load app modules unchanged.
 *
 * Two gaps stand between `node --test` and `src/`: the `@/*` path alias, which
 * only the bundler knows about, and JSX, which Node's type stripping leaves
 * alone. Both are closed here so a test can import the real module rather than
 * a copy of its logic.
 */
const srcUrl = new URL("../src/", import.meta.url);

const EXTENSIONS = [".ts", ".tsx", "/index.ts", "/index.tsx"];

export function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith("@/")) return nextResolve(specifier, context);

  const base = new URL(specifier.slice(2), srcUrl).href;
  const match = EXTENSIONS.map((extension) => `${base}${extension}`).find(
    (candidate) => existsSync(fileURLToPath(candidate)),
  );
  return nextResolve(match ?? base, context);
}

export async function load(url, context, nextLoad) {
  if (!url.endsWith(".tsx")) return nextLoad(url, context);

  const source = await readFile(fileURLToPath(url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    fileName: fileURLToPath(url),
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  return { format: "module", shortCircuit: true, source: outputText };
}
