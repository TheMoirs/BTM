import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Loader2, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MOBILE_PDF_EVENT, type MobilePdfRequest } from "@/lib/utils";

/**
 * Full-screen print page for phones and tablets.
 *
 * Phone browsers (Android Chrome in particular) open a PDF in a viewer with no
 * Print button, so instead we draw each page of the report as a picture here,
 * with our own Print and Save PDF buttons. Print uses the browser's normal print
 * screen on this page, where only the report pictures are shown.
 */

type Rendered = { src: string; widthMm: number; heightMm: number };

const PT_TO_MM = 25.4 / 72;

async function renderPages(blob: Blob): Promise<Rendered[]> {
  // Loaded only when needed, so the rest of the app stays small
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const workerUrl = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const data = new Uint8Array(await blob.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages: Rendered[] = [];
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      // About 200 dpi: sharp on paper, still light enough for a phone
      const viewport = page.getViewport({ scale: 200 / 72 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      pages.push({
        src: canvas.toDataURL("image/png"),
        widthMm: base.width * PT_TO_MM,
        heightMm: base.height * PT_TO_MM,
      });
      page.cleanup();
    }
  } finally {
    pdf.destroy();
  }
  return pages;
}

export function MobilePdfViewer() {
  const [request, setRequest] = useState<MobilePdfRequest | null>(null);
  const [pages, setPages] = useState<Rendered[] | null>(null);
  const [error, setError] = useState(false);

  // Any page can ask for the viewer through openPdfMobile()
  useEffect(() => {
    const onOpen = (e: Event) => {
      setPages(null);
      setError(false);
      setRequest((e as CustomEvent<MobilePdfRequest>).detail);
    };
    window.addEventListener(MOBILE_PDF_EVENT, onOpen);
    return () => window.removeEventListener(MOBILE_PDF_EVENT, onOpen);
  }, []);

  // Draw the pages
  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    renderPages(request.doc.output("blob"))
      .then((p) => !cancelled && setPages(p))
      .catch((err) => {
        console.error("Couldn't draw the PDF pages:", err);
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [request]);

  // While open: hide the app behind it, stop the background scrolling,
  // and make printed pages match the report's own page size
  useEffect(() => {
    if (!request) return;
    const root = document.documentElement;
    root.classList.add("ptm-pdf-open");
    const first = pages?.[0];
    const style = document.createElement("style");
    style.textContent = first
      ? `@media print { @page { size: ${first.widthMm.toFixed(1)}mm ${first.heightMm.toFixed(1)}mm; margin: 0; } }`
      : "";
    document.head.appendChild(style);
    return () => {
      root.classList.remove("ptm-pdf-open");
      style.remove();
    };
  }, [request, pages]);

  // Phone back button closes the viewer rather than leaving the page
  useEffect(() => {
    if (!request) return;
    window.history.pushState({ ptmPdf: true }, "");
    const onPop = () => setRequest(null);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (window.history.state?.ptmPdf) window.history.back();
    };
  }, [request]);

  if (!request) return null;

  const close = () => setRequest(null);
  const save = () => {
    try {
      request.doc.save(request.filename);
    } catch (err) {
      console.error("Couldn't save the PDF:", err);
    }
  };
  const title = request.filename.replace(/\.pdf$/i, "");

  return createPortal(
    <div id="ptm-pdf-viewer" className="fixed inset-0 z-[100] flex flex-col bg-muted" role="dialog" aria-modal="true" aria-label={title}>
      <div className="ptm-pdf-toolbar flex items-center gap-2 border-b bg-background px-3 py-2 shadow-sm">
        <Button variant="ghost" size="icon" onClick={close} aria-label="Close" data-testid="button-close-mobile-pdf">
          <X className="h-5 w-5" />
        </Button>
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{title}</p>
        <Button variant="outline" size="sm" onClick={save} data-testid="button-save-mobile-pdf">
          <Download className="h-4 w-4 mr-1.5" />
          Save PDF
        </Button>
        <Button size="sm" onClick={() => window.print()} disabled={!pages} data-testid="button-print-mobile-pdf">
          <Printer className="h-4 w-4 mr-1.5" />
          Print
        </Button>
      </div>

      <div className="ptm-pdf-pages flex-1 overflow-y-auto p-3 space-y-3">
        {error ? (
          <div className="mx-auto max-w-sm rounded-md bg-background p-4 text-center text-sm">
            <p className="mb-3">Couldn't show the report here. You can still save it and print it from your Downloads.</p>
            <Button onClick={save}>
              <Download className="h-4 w-4 mr-1.5" />
              Save PDF
            </Button>
          </div>
        ) : !pages ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Preparing pages…
          </div>
        ) : (
          pages.map((p, i) => (
            <img
              key={i}
              src={p.src}
              alt={`Page ${i + 1} of ${pages.length}`}
              className="ptm-pdf-page mx-auto block w-full max-w-3xl bg-white shadow"
              data-testid={`img-mobile-pdf-page-${i + 1}`}
            />
          ))
        )}
      </div>
    </div>,
    document.body,
  );
}
