import { DownloadPdfButton } from "@/components/download-pdf-button";
import { PrintPageButton } from "@/components/print-page-button";

/**
 * Primary Download fetches the server PDF. Print page is optional and
 * secondary — it must not be the path that produces the file.
 */
export function ReportActions({ pdfHref }: { pdfHref: string }) {
  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <DownloadPdfButton href={pdfHref} />
      <PrintPageButton />
    </div>
  );
}
