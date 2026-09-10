"use client";

import { useState, type MouseEvent } from "react";

import { BRAND } from "@/lib/config";

type Status = "idle" | "loading" | "error";

function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const utf = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  if (utf?.[1]) {
    try {
      return decodeURIComponent(utf[1].replace(/['"]/g, "").trim());
    } catch {
      return utf[1].replace(/['"]/g, "").trim();
    }
  }
  const quoted = /filename="([^"]+)"/i.exec(header);
  if (quoted?.[1]) return quoted[1];
  const plain = /filename=([^;]+)/i.exec(header);
  return plain?.[1]?.trim() ?? null;
}

/**
 * Fetches a server-generated PDF and saves it. The href is the API file so
 * a click still works if script fails; the handler prefers a blob download
 * so the primary path never opens the browser print dialog.
 */
export function DownloadPdfButton({ href }: { href: string }) {
  const [status, setStatus] = useState<Status>("idle");

  async function onClick(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    try {
      const response = await fetch(href, { cache: "no-store" });
      if (!response.ok) throw new Error("download failed");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const filename =
        filenameFromContentDisposition(response.headers.get("Content-Disposition")) ??
        `${BRAND.filePrefix}.pdf`;
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="no-print">
      <a
        href={href}
        download
        onClick={onClick}
        aria-busy={status === "loading"}
        aria-disabled={status === "loading"}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
        </svg>
        {status === "loading" ? "Preparing PDF…" : "Download PDF"}
      </a>
      {status === "error" ? (
        <p className="mt-2 text-xs text-rose-600" role="status">
          Couldn&apos;t prepare the PDF. Try again.
        </p>
      ) : null}
    </div>
  );
}
