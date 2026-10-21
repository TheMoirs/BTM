import { useEffect, useId, useRef } from "react";
import type jsPDF from "jspdf";
import { Download, ExternalLink, FileSpreadsheet, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { showNamedPdf } from "@/lib/utils";

export type PdfPreview = { doc: jsPDF; filename: string };

type Props = {
  title: string;
  preview: PdfPreview | null;
  onClose: () => void;
  /** Offer an Excel download of the same data */
  onExcel?: () => void;
};

/**
 * Preview of a PDF report, shown under its proper file name, so the browser's own
 * download button and "Open in New Tab" both save it correctly named.
 */
export function PdfPreviewDialog({ title, preview, onClose, onExcel }: Props) {
  const frameName = `pdf-preview-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const frameRef = useRef<HTMLIFrameElement>(null);

  // Once the frame is on screen, load the PDF into it
  useEffect(() => {
    if (!preview) return;
    const timer = setTimeout(() => {
      if (frameRef.current) showNamedPdf(preview.doc, preview.filename, frameName);
    }, 50);
    return () => clearTimeout(timer);
  }, [preview, frameName]);

  const download = () => {
    if (preview) preview.doc.save(preview.filename);
  };
  const openInTab = () => {
    if (preview) showNamedPdf(preview.doc, preview.filename, "_blank");
  };
  const print = () => {
    try {
      frameRef.current?.contentWindow?.focus();
      frameRef.current?.contentWindow?.print();
    } catch {
      openInTab(); // print from the new tab instead
    }
  };

  return (
    <Dialog open={!!preview} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {preview && <p className="text-xs text-muted-foreground break-all">{preview.filename}</p>}
        </DialogHeader>
        <div className="flex-1 min-h-0 flex flex-col gap-4">
          <div className="flex-1 min-h-0 border rounded-lg overflow-hidden bg-muted">
            <iframe ref={frameRef} name={frameName} className="w-full h-full" title="PDF Preview" data-testid="pdf-preview-iframe" />
          </div>
          <div className="flex gap-2 justify-end flex-wrap">
            <Button variant="outline" onClick={download} data-testid="button-save-pdf">
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
            {onExcel && (
              <Button variant="outline" onClick={onExcel} data-testid="button-save-excel">
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Excel
              </Button>
            )}
            <Button variant="outline" onClick={openInTab} data-testid="button-open-new-tab-pdf">
              <ExternalLink className="h-4 w-4 mr-2" />
              Open in New Tab
            </Button>
            <Button onClick={print} data-testid="button-print-pdf">
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
            <Button variant="outline" onClick={onClose} data-testid="button-close-pdf">
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
