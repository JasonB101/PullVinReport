"use client";

/**
 * Secondary control: print the on-screen page.
 *
 * Download is the PDF path. This stays a quiet option for paper — it must
 * not be labelled as save-as-PDF, which is what the server file is for.
 */
export function PrintPageButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-xl px-2 py-2.5 text-sm font-medium text-slate-500 transition hover:text-slate-800"
    >
      Print page
    </button>
  );
}
