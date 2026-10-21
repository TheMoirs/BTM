import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { isMobileDevice, openPdfMobile } from "@/lib/utils";
import type { TeamSummary } from "@/lib/leaderboard";

const stageLabels: Record<string, string> = {
  initial: "Stage 1",
  "quarter-finals": "Quarter-Finals",
  "semi-finals": "Semi-Finals",
  finals: "Finals",
};

type LeaderboardData = [string, [string, TeamSummary[]][]][];

/** Leaderboard (or forecast) standings for every stage and division, landscape A4 */
export function buildLeaderboardPdf(opts: {
  tournamentName?: string | null;
  description?: string | null;
  data: LeaderboardData;
  isForecast: boolean;
}) {
  const { tournamentName, description, data, isForecast } = opts;
  const doc = new jsPDF({ orientation: "landscape" });
  const pageHeight = doc.internal.pageSize.height;
  const bottomMargin = 20;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(tournamentName || "Tournament", 14, 12);
  doc.setFont("helvetica", "normal");

  let headerY = 18;
  if (description) {
    doc.setFontSize(10);
    doc.text(description, 14, headerY);
    headerY += 5;
  }

  doc.setFontSize(9);
  const title = isForecast ? "Team Forecast (All Stages)" : "Team Leaderboard (All Stages)";
  doc.text(`${title} - Generated: ${new Date().toLocaleString()}`, 14, headerY);

  let startY = headerY + 5;

  data.forEach(([stage, divisions], stageIndex) => {
    if (stageIndex > 0) startY += 10;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`Stage: ${stageLabels[stage] ?? stage}`, 14, startY);
    doc.setFont("helvetica", "normal");
    startY += 6;

    divisions.forEach(([division, summaries], divIndex) => {
      const divisionLabel = division !== "No Division" ? `Division ${division}` : "No Division Assigned";

      // Conservative estimate of the space this division needs
      const estimatedHeight = 5 + 12 + summaries.length * 9 + 15;
      if (startY + estimatedHeight > pageHeight - bottomMargin && divIndex > 0) {
        doc.addPage();
        startY = 20;
      } else if (divIndex > 0) {
        startY += 8;
      }

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(divisionLabel, 14, startY);
      doc.setFont("helvetica", "normal");
      startY += 5;

      const body = summaries.map((s) => [
        s.position !== null ? s.position.toString() : "",
        s.teamName,
        s.gamesPlayed.toString(),
        s.gamesWon.toString(),
        s.gamesDrawn.toString(),
        s.gamesLost.toString(),
        s.points.toString(),
        s.scoreFor.toString(),
        s.scoreAgainst.toString(),
        s.scoreDifference.toString(),
      ]);

      let isFirstPageForDivision = true;
      autoTable(doc, {
        head: [["Pos", "Team", "Played", "Won", "Drawn", "Lost", "Points", "For", "Against", "Diff"]],
        body,
        startY,
        margin: { top: 25, bottom: 10, left: 14, right: 14 },
        styles: { fontSize: 10, cellPadding: 3 },
        headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: "bold" },
        columnStyles: {
          0: { cellWidth: 18, halign: "center" },
          1: { cellWidth: 60 },
          2: { cellWidth: 22, halign: "center" },
          3: { cellWidth: 22, halign: "center" },
          4: { cellWidth: 22, halign: "center" },
          5: { cellWidth: 22, halign: "center" },
          6: { cellWidth: 22, halign: "center" },
          7: { cellWidth: 22, halign: "center" },
          8: { cellWidth: 22, halign: "center" },
          9: { cellWidth: 22, halign: "center" },
        },
        didDrawPage: () => {
          if (!isFirstPageForDivision) {
            // Division heading again on continuation pages
            doc.setFontSize(11);
            doc.setFont("helvetica", "bold");
            doc.text(divisionLabel, 14, 22);
            doc.setFont("helvetica", "normal");
          }
          isFirstPageForDivision = false;
        },
      });

      // @ts-ignore - autoTable adds lastAutoTable to doc
      startY = doc.lastAutoTable.finalY + 5;
    });
  });

  return doc;
}

/**
 * The "Print" button: saves the PDF to the device, then offers to print it.
 * Computers: the file goes to Downloads and the print dialog opens.
 * Phones and tablets: the PDF opens, where Share gives Print and Save.
 * Returns what happened, so the page can show the right message.
 */
export function downloadAndPrintPdf(doc: jsPDF, filename: string): "printing" | "opened" | "failed" {
  if (isMobileDevice()) {
    return openPdfMobile(doc, filename) ? "opened" : "failed";
  }

  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);

  // 1) Save a copy
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // 2) Print it. Desktop Safari doesn't print PDFs from a hidden frame, so open it in a tab there.
  const ua = navigator.userAgent;
  const isDesktopSafari = /Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\//.test(ua);
  if (isDesktopSafari) {
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return "opened";
  }

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  const cleanUp = () => {
    frame.remove();
    URL.revokeObjectURL(url);
  };
  frame.onload = () => {
    setTimeout(() => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        // Some browsers block printing from a frame: show the PDF in a tab instead
        window.open(url, "_blank");
      }
      setTimeout(cleanUp, 60_000);
    }, 300);
  };
  frame.src = url;
  document.body.appendChild(frame);
  return "printing";
}
