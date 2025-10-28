import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Result } from "@shared/schema";
import { Trash2, ArrowUpDown, ArrowUp, ArrowDown, Trophy, BarChart3, Filter, FileDown, Download, Printer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type SortColumn = "matchInfo" | "matchDate" | "teamName" | "gamesPlayed" | "gamesWon" | "gamesLost" | "gamesDrawn" | "points" | "scoreFor" | "scoreAgainst" | "scoreDifference" | "stage";
type SortDirection = "asc" | "desc";

const stageLabels = {
  initial: "Initial",
  "quarter-finals": "Quarter-Finals",
  "semi-finals": "Semi-Finals",
  finals: "Finals",
};

type TeamSummary = {
  teamName: string;
  gamesPlayed: number;
  gamesWon: number;
  gamesDrawn: number;
  gamesLost: number;
  points: number;
  scoreFor: number;
  scoreAgainst: number;
  scoreDifference: number;
};

export default function Results() {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>("points");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [showSummaryPdfViewer, setShowSummaryPdfViewer] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [summaryPdfBlobUrl, setSummaryPdfBlobUrl] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: results, isLoading } = useQuery<Result[]>({
    queryKey: ["/api/results"],
  });

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const filteredResults = useMemo(() => {
    if (!results) return [];
    if (stageFilter === "all") return results;
    return results.filter(result => result.stage === stageFilter);
  }, [results, stageFilter]);

  const getSortedResults = useMemo(() => {
    return [...filteredResults].sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";

      switch (sortColumn) {
        case "matchInfo":
          aVal = a.matchInfo.toLowerCase();
          bVal = b.matchInfo.toLowerCase();
          break;
        case "matchDate":
          aVal = a.matchDate || "";
          bVal = b.matchDate || "";
          break;
        case "teamName":
          aVal = a.teamName.toLowerCase();
          bVal = b.teamName.toLowerCase();
          break;
        case "stage":
          aVal = a.stage.toLowerCase();
          bVal = b.stage.toLowerCase();
          break;
        case "gamesPlayed":
          aVal = a.gamesPlayed;
          bVal = b.gamesPlayed;
          break;
        case "gamesWon":
          aVal = a.gamesWon;
          bVal = b.gamesWon;
          break;
        case "gamesLost":
          aVal = a.gamesLost;
          bVal = b.gamesLost;
          break;
        case "gamesDrawn":
          aVal = a.gamesDrawn;
          bVal = b.gamesDrawn;
          break;
        case "points":
          aVal = a.points;
          bVal = b.points;
          break;
        case "scoreFor":
          aVal = a.scoreFor;
          bVal = b.scoreFor;
          break;
        case "scoreAgainst":
          aVal = a.scoreAgainst;
          bVal = b.scoreAgainst;
          break;
        case "scoreDifference":
          aVal = a.scoreDifference;
          bVal = b.scoreDifference;
          break;
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredResults, sortColumn, sortDirection]);

  const teamSummaries = useMemo(() => {
    if (!filteredResults || filteredResults.length === 0) return [];

    const summaryMap = new Map<string, TeamSummary>();

    filteredResults.forEach(result => {
      if (!summaryMap.has(result.teamName)) {
        summaryMap.set(result.teamName, {
          teamName: result.teamName,
          gamesPlayed: 0,
          gamesWon: 0,
          gamesDrawn: 0,
          gamesLost: 0,
          points: 0,
          scoreFor: 0,
          scoreAgainst: 0,
          scoreDifference: 0,
        });
      }

      const summary = summaryMap.get(result.teamName)!;
      summary.gamesPlayed += result.gamesPlayed;
      summary.gamesWon += result.gamesWon;
      summary.gamesLost += result.gamesLost;
      summary.gamesDrawn += result.gamesDrawn;
      summary.points += result.points;
      summary.scoreFor += result.scoreFor;
      summary.scoreAgainst += result.scoreAgainst;
      summary.scoreDifference += result.scoreDifference;
    });

    return Array.from(summaryMap.values()).sort((a, b) => {
      // Sort by points first, then by score difference
      if (b.points !== a.points) {
        return b.points - a.points;
      }
      return b.scoreDifference - a.scoreDifference;
    });
  }, [filteredResults]);

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="ml-1 h-3 w-3" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="ml-1 h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3" />
    );
  };

  const handleClearAllResults = async () => {
    try {
      await apiRequest("DELETE", "/api/results");
      queryClient.invalidateQueries({ queryKey: ["/api/results"] });
      setShowClearConfirm(false);
      toast({
        title: "Results cleared",
        description: "All results have been removed.",
      });
    } catch (error) {
      console.error("Error clearing results:", error);
      toast({
        title: "Error",
        description: "Failed to clear results.",
        variant: "destructive",
      });
    }
  };

  const availableStages = useMemo(() => {
    if (!results) return [];
    const stages = new Set(results.map(r => r.stage));
    return Array.from(stages).sort();
  }, [results]);

  const generateResultsPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', compress: true });
    
    doc.setFontSize(18);
    doc.text('Match Results Report', 14, 15);
    
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 22);
    if (stageFilter !== "all") {
      doc.text(`Stage: ${stageLabels[stageFilter as keyof typeof stageLabels]}`, 14, 27);
    }
    
    const tableData = getSortedResults.map((result) => [
      result.matchInfo,
      result.matchDate || '—',
      stageLabels[result.stage as keyof typeof stageLabels] || result.stage,
      result.teamName,
      result.gamesPlayed.toString(),
      result.gamesWon.toString(),
      result.gamesDrawn.toString(),
      result.gamesLost.toString(),
      result.points.toString(),
      result.scoreFor.toString(),
      result.scoreAgainst.toString(),
      result.scoreDifference.toString(),
    ]);
    
    autoTable(doc, {
      head: [['Match', 'Date', 'Stage', 'Team', 'P', 'W', 'D', 'L', 'Pts', 'F', 'A', 'Diff']],
      body: tableData,
      startY: stageFilter !== "all" ? 32 : 28,
      styles: {
        fontSize: 8,
        cellPadding: 1.5,
      },
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: 255,
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 22 },
        2: { cellWidth: 30 },
        3: { cellWidth: 40 },
        4: { cellWidth: 10, halign: 'center' },
        5: { cellWidth: 10, halign: 'center' },
        6: { cellWidth: 10, halign: 'center' },
        7: { cellWidth: 10, halign: 'center' },
        8: { cellWidth: 12, halign: 'center' },
        9: { cellWidth: 10, halign: 'center' },
        10: { cellWidth: 10, halign: 'center' },
        11: { cellWidth: 12, halign: 'center' },
      },
    });
    
    return doc;
  };

  const generateSummaryPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', compress: true });
    
    doc.setFontSize(18);
    doc.text('Team Summary Statistics', 14, 15);
    
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 22);
    if (stageFilter !== "all") {
      doc.text(`Stage: ${stageLabels[stageFilter as keyof typeof stageLabels]}`, 14, 27);
    }
    
    const tableData = teamSummaries.map((summary) => [
      summary.teamName,
      summary.gamesPlayed.toString(),
      summary.gamesWon.toString(),
      summary.gamesDrawn.toString(),
      summary.gamesLost.toString(),
      summary.points.toString(),
      summary.scoreFor.toString(),
      summary.scoreAgainst.toString(),
      summary.scoreDifference.toString(),
    ]);
    
    autoTable(doc, {
      head: [['Team', 'Played', 'Won', 'Drawn', 'Lost', 'Points', 'For', 'Against', 'Diff']],
      body: tableData,
      startY: stageFilter !== "all" ? 32 : 28,
      styles: {
        fontSize: 10,
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: 255,
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 22, halign: 'center' },
        2: { cellWidth: 22, halign: 'center' },
        3: { cellWidth: 22, halign: 'center' },
        4: { cellWidth: 22, halign: 'center' },
        5: { cellWidth: 22, halign: 'center' },
        6: { cellWidth: 22, halign: 'center' },
        7: { cellWidth: 22, halign: 'center' },
        8: { cellWidth: 22, halign: 'center' },
      },
    });
    
    return doc;
  };

  const openPdfViewer = () => {
    const doc = generateResultsPDF();
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    if (isMobile) {
      setPdfBlobUrl(doc.output('dataurlstring'));
    } else {
      const pdfBlob = doc.output('blob');
      setPdfBlobUrl(URL.createObjectURL(pdfBlob));
    }
    
    setShowPdfViewer(true);
  };

  const openSummaryPdfViewer = () => {
    const doc = generateSummaryPDF();
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    if (isMobile) {
      setSummaryPdfBlobUrl(doc.output('dataurlstring'));
    } else {
      const pdfBlob = doc.output('blob');
      setSummaryPdfBlobUrl(URL.createObjectURL(pdfBlob));
    }
    
    setShowSummaryPdfViewer(true);
  };

  const handlePdfSave = (isSummary: boolean) => {
    const doc = isSummary ? generateSummaryPDF() : generateResultsPDF();
    const pdfBlob = doc.output('blob');
    const url = URL.createObjectURL(pdfBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${isSummary ? 'summary' : 'results'}-report-${new Date().toISOString().split('T')[0]}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setTimeout(() => URL.revokeObjectURL(url), 100);
    
    toast({
      title: "PDF saved",
      description: "The PDF has been downloaded to your default downloads folder.",
    });
  };

  const handlePdfPrint = (isSummary: boolean) => {
    const blobUrl = isSummary ? summaryPdfBlobUrl : pdfBlobUrl;
    if (blobUrl) {
      const printWindow = window.open(blobUrl, '_blank');
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
      }
    }
  };

  const closePdfViewer = () => {
    setShowPdfViewer(false);
    if (pdfBlobUrl && pdfBlobUrl.startsWith('blob:')) {
      URL.revokeObjectURL(pdfBlobUrl);
    }
    setPdfBlobUrl(null);
  };

  const closeSummaryPdfViewer = () => {
    setShowSummaryPdfViewer(false);
    if (summaryPdfBlobUrl && summaryPdfBlobUrl.startsWith('blob:')) {
      URL.revokeObjectURL(summaryPdfBlobUrl);
    }
    setSummaryPdfBlobUrl(null);
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Results</h1>
          <p className="text-muted-foreground">
            View match results and team points
          </p>
        </div>
        <div className="flex gap-2">
          {results && results.length > 0 && (
            <>
              <Dialog open={showSummary} onOpenChange={setShowSummary}>
                <DialogTrigger asChild>
                  <Button variant="default" data-testid="button-show-summary">
                    <BarChart3 className="mr-2 h-4 w-4" />
                    Summary
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <div className="flex items-center justify-between">
                      <DialogTitle>
                        Team Summary Statistics
                        {stageFilter !== "all" && ` - ${stageLabels[stageFilter as keyof typeof stageLabels]}`}
                      </DialogTitle>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={openSummaryPdfViewer}
                        data-testid="button-summary-view-pdf"
                      >
                        <FileDown className="mr-2 h-4 w-4" />
                        View PDF
                      </Button>
                    </div>
                  </DialogHeader>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Team</TableHead>
                          <TableHead className="text-center">Played</TableHead>
                          <TableHead className="text-center">Won</TableHead>
                          <TableHead className="text-center">Drawn</TableHead>
                          <TableHead className="text-center">Lost</TableHead>
                          <TableHead className="text-center">Points</TableHead>
                          <TableHead className="text-center">Score For</TableHead>
                          <TableHead className="text-center">Score Against</TableHead>
                          <TableHead className="text-center">Score Difference</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {teamSummaries.map((summary) => (
                          <TableRow key={summary.teamName} data-testid={`row-summary-${summary.teamName}`}>
                            <TableCell className="font-medium" data-testid={`text-team-${summary.teamName}`}>
                              {summary.teamName}
                            </TableCell>
                            <TableCell className="text-center" data-testid={`text-played-${summary.teamName}`}>
                              <span className="font-mono">{summary.gamesPlayed}</span>
                            </TableCell>
                            <TableCell className="text-center" data-testid={`text-won-${summary.teamName}`}>
                              <span className="font-mono">{summary.gamesWon}</span>
                            </TableCell>
                            <TableCell className="text-center" data-testid={`text-drawn-${summary.teamName}`}>
                              <span className="font-mono">{summary.gamesDrawn}</span>
                            </TableCell>
                            <TableCell className="text-center" data-testid={`text-lost-${summary.teamName}`}>
                              <span className="font-mono">{summary.gamesLost}</span>
                            </TableCell>
                            <TableCell className="text-center" data-testid={`text-points-${summary.teamName}`}>
                              <Badge variant="default" className="font-mono">
                                {summary.points}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center" data-testid={`text-score-for-${summary.teamName}`}>
                              <span className="font-mono">{summary.scoreFor}</span>
                            </TableCell>
                            <TableCell className="text-center" data-testid={`text-score-against-${summary.teamName}`}>
                              <span className="font-mono">{summary.scoreAgainst}</span>
                            </TableCell>
                            <TableCell className="text-center" data-testid={`text-score-difference-${summary.teamName}`}>
                              <Badge 
                                variant={summary.scoreDifference > 0 ? "default" : summary.scoreDifference < 0 ? "destructive" : "secondary"}
                                className="font-mono"
                              >
                                {summary.scoreDifference > 0 ? '+' : ''}{summary.scoreDifference}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </DialogContent>
              </Dialog>
              <Button
                variant="outline"
                onClick={openPdfViewer}
                data-testid="button-view-pdf"
              >
                <FileDown className="mr-2 h-4 w-4" />
                View PDF
              </Button>
              <Button
                variant="destructive"
                onClick={() => setShowClearConfirm(true)}
                data-testid="button-clear-all-results"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Clear All Results
              </Button>
            </>
          )}
        </div>
      </div>

      {results && results.length > 0 && (
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-[200px]" data-testid="select-stage-filter">
              <SelectValue placeholder="Filter by stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              {availableStages.map(stage => (
                <SelectItem key={stage} value={stage}>
                  {stageLabels[stage as keyof typeof stageLabels]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {isLoading ? (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">Loading results...</div>
          </CardContent>
        </Card>
      ) : !results || results.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-3">
              <Trophy className="h-12 w-12 mx-auto text-muted-foreground" />
              <div>
                <p className="text-lg font-medium">No results yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Results will appear here when match scores are entered
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : filteredResults.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-3">
              <Trophy className="h-12 w-12 mx-auto text-muted-foreground" />
              <div>
                <p className="text-lg font-medium">No results for this stage</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Try selecting a different stage
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              {stageFilter === "all" 
                ? `All Results (${filteredResults.length})`
                : `${stageLabels[stageFilter as keyof typeof stageLabels]} Results (${filteredResults.length})`
              }
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <button
                        className="flex items-center hover-elevate active-elevate-2 font-medium -ml-3 px-3 py-1 rounded"
                        onClick={() => handleSort("matchInfo")}
                        data-testid="sort-matchInfo"
                      >
                        Match
                        <SortIcon column="matchInfo" />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        className="flex items-center hover-elevate active-elevate-2 font-medium -ml-3 px-3 py-1 rounded"
                        onClick={() => handleSort("stage")}
                        data-testid="sort-stage"
                      >
                        Stage
                        <SortIcon column="stage" />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        className="flex items-center hover-elevate active-elevate-2 font-medium -ml-3 px-3 py-1 rounded"
                        onClick={() => handleSort("matchDate")}
                        data-testid="sort-matchDate"
                      >
                        Date
                        <SortIcon column="matchDate" />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        className="flex items-center hover-elevate active-elevate-2 font-medium -ml-3 px-3 py-1 rounded"
                        onClick={() => handleSort("teamName")}
                        data-testid="sort-teamName"
                      >
                        Team
                        <SortIcon column="teamName" />
                      </button>
                    </TableHead>
                    <TableHead className="text-center">
                      <button
                        className="flex items-center justify-center hover-elevate active-elevate-2 font-medium -ml-3 px-3 py-1 rounded w-full"
                        onClick={() => handleSort("gamesPlayed")}
                        data-testid="sort-gamesPlayed"
                      >
                        Played
                        <SortIcon column="gamesPlayed" />
                      </button>
                    </TableHead>
                    <TableHead className="text-center">
                      <button
                        className="flex items-center justify-center hover-elevate active-elevate-2 font-medium -ml-3 px-3 py-1 rounded w-full"
                        onClick={() => handleSort("gamesWon")}
                        data-testid="sort-gamesWon"
                      >
                        Won
                        <SortIcon column="gamesWon" />
                      </button>
                    </TableHead>
                    <TableHead className="text-center">
                      <button
                        className="flex items-center justify-center hover-elevate active-elevate-2 font-medium -ml-3 px-3 py-1 rounded w-full"
                        onClick={() => handleSort("gamesLost")}
                        data-testid="sort-gamesLost"
                      >
                        Lost
                        <SortIcon column="gamesLost" />
                      </button>
                    </TableHead>
                    <TableHead className="text-center">
                      <button
                        className="flex items-center justify-center hover-elevate active-elevate-2 font-medium -ml-3 px-3 py-1 rounded w-full"
                        onClick={() => handleSort("gamesDrawn")}
                        data-testid="sort-gamesDrawn"
                      >
                        Drawn
                        <SortIcon column="gamesDrawn" />
                      </button>
                    </TableHead>
                    <TableHead className="text-center">
                      <button
                        className="flex items-center justify-center hover-elevate active-elevate-2 font-medium -ml-3 px-3 py-1 rounded w-full"
                        onClick={() => handleSort("points")}
                        data-testid="sort-points"
                      >
                        Points
                        <SortIcon column="points" />
                      </button>
                    </TableHead>
                    <TableHead className="text-center">
                      <button
                        className="flex items-center justify-center hover-elevate active-elevate-2 font-medium -ml-3 px-3 py-1 rounded w-full"
                        onClick={() => handleSort("scoreFor")}
                        data-testid="sort-scoreFor"
                      >
                        Score For
                        <SortIcon column="scoreFor" />
                      </button>
                    </TableHead>
                    <TableHead className="text-center">
                      <button
                        className="flex items-center justify-center hover-elevate active-elevate-2 font-medium -ml-3 px-3 py-1 rounded w-full"
                        onClick={() => handleSort("scoreAgainst")}
                        data-testid="sort-scoreAgainst"
                      >
                        Score Against
                        <SortIcon column="scoreAgainst" />
                      </button>
                    </TableHead>
                    <TableHead className="text-center">
                      <button
                        className="flex items-center justify-center hover-elevate active-elevate-2 font-medium -ml-3 px-3 py-1 rounded w-full"
                        onClick={() => handleSort("scoreDifference")}
                        data-testid="sort-scoreDifference"
                      >
                        Score Diff
                        <SortIcon column="scoreDifference" />
                      </button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {getSortedResults.map((result) => (
                    <TableRow key={result.id} data-testid={`row-result-${result.id}`}>
                      <TableCell data-testid={`text-match-${result.id}`}>
                        {result.matchInfo}
                      </TableCell>
                      <TableCell data-testid={`text-stage-${result.id}`}>
                        <Badge variant="outline">
                          {stageLabels[result.stage as keyof typeof stageLabels]}
                        </Badge>
                      </TableCell>
                      <TableCell data-testid={`text-date-${result.id}`}>
                        {result.matchDate ? (
                          <span className="text-sm">
                            {new Date(result.matchDate).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell data-testid={`text-team-${result.id}`}>
                        {result.teamName}
                      </TableCell>
                      <TableCell className="text-center" data-testid={`text-games-played-${result.id}`}>
                        <span className="font-mono">{result.gamesPlayed}</span>
                      </TableCell>
                      <TableCell className="text-center" data-testid={`text-games-won-${result.id}`}>
                        <span className="font-mono">{result.gamesWon}</span>
                      </TableCell>
                      <TableCell className="text-center" data-testid={`text-games-lost-${result.id}`}>
                        <span className="font-mono">{result.gamesLost}</span>
                      </TableCell>
                      <TableCell className="text-center" data-testid={`text-games-drawn-${result.id}`}>
                        <span className="font-mono">{result.gamesDrawn}</span>
                      </TableCell>
                      <TableCell className="text-center" data-testid={`text-points-${result.id}`}>
                        <Badge 
                          variant={result.points === 2 ? "default" : result.points === 1 ? "secondary" : "outline"}
                          className="font-mono"
                        >
                          {result.points}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center" data-testid={`text-score-for-${result.id}`}>
                        <span className="font-mono">{result.scoreFor}</span>
                      </TableCell>
                      <TableCell className="text-center" data-testid={`text-score-against-${result.id}`}>
                        <span className="font-mono">{result.scoreAgainst}</span>
                      </TableCell>
                      <TableCell className="text-center" data-testid={`text-score-difference-${result.id}`}>
                        <Badge 
                          variant={result.scoreDifference > 0 ? "default" : result.scoreDifference < 0 ? "destructive" : "secondary"}
                          className="font-mono"
                        >
                          {result.scoreDifference > 0 ? '+' : ''}{result.scoreDifference}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all results?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all result records from the system. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-clear">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearAllResults}
              className="bg-destructive text-destructive-foreground hover-elevate"
              data-testid="button-confirm-clear"
            >
              Clear All Results
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showPdfViewer} onOpenChange={(open) => !open && closePdfViewer()}>
        <DialogContent className="max-w-4xl h-[90vh]" aria-describedby="pdf-viewer-description">
          <DialogHeader>
            <DialogTitle>Results Report Preview</DialogTitle>
            <p id="pdf-viewer-description" className="sr-only">
              Preview the PDF report before saving or printing
            </p>
          </DialogHeader>
          <div className="flex-1 overflow-hidden flex flex-col gap-4">
            <div className="flex-1 border rounded-lg overflow-hidden bg-muted">
              {pdfBlobUrl && (
                <iframe
                  src={pdfBlobUrl}
                  className="w-full h-full"
                  title="PDF Preview"
                  data-testid="pdf-preview-iframe"
                />
              )}
            </div>
            <div className="flex gap-2 justify-end flex-wrap">
              <Button
                variant="outline"
                onClick={() => handlePdfSave(false)}
                data-testid="button-save-pdf"
              >
                <Download className="h-4 w-4 mr-2" />
                Save
              </Button>
              <Button
                variant="outline"
                onClick={() => handlePdfPrint(false)}
                data-testid="button-print-pdf"
              >
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
              <Button
                variant="outline"
                onClick={closePdfViewer}
                data-testid="button-close-pdf"
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showSummaryPdfViewer} onOpenChange={(open) => !open && closeSummaryPdfViewer()}>
        <DialogContent className="max-w-4xl h-[90vh]" aria-describedby="summary-pdf-viewer-description">
          <DialogHeader>
            <DialogTitle>Summary Report Preview</DialogTitle>
            <p id="summary-pdf-viewer-description" className="sr-only">
              Preview the PDF summary report before saving or printing
            </p>
          </DialogHeader>
          <div className="flex-1 overflow-hidden flex flex-col gap-4">
            <div className="flex-1 border rounded-lg overflow-hidden bg-muted">
              {summaryPdfBlobUrl && (
                <iframe
                  src={summaryPdfBlobUrl}
                  className="w-full h-full"
                  title="PDF Preview"
                  data-testid="summary-pdf-preview-iframe"
                />
              )}
            </div>
            <div className="flex gap-2 justify-end flex-wrap">
              <Button
                variant="outline"
                onClick={() => handlePdfSave(true)}
                data-testid="button-save-summary-pdf"
              >
                <Download className="h-4 w-4 mr-2" />
                Save
              </Button>
              <Button
                variant="outline"
                onClick={() => handlePdfPrint(true)}
                data-testid="button-print-summary-pdf"
              >
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
              <Button
                variant="outline"
                onClick={closeSummaryPdfViewer}
                data-testid="button-close-summary-pdf"
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
