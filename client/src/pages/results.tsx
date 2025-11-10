import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { isMobileDevice, openPdfMobile } from "@/lib/utils";
import { useTournament } from "@/contexts/TournamentContext";
import { useViewMode } from "@/contexts/ViewModeContext";
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
import type { Result, Team } from "@shared/schema";
import { Trash2, ArrowUpDown, ArrowUp, ArrowDown, Trophy, BarChart3, Filter, FileDown, Download, Printer, X, Share2, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { HelpDialog } from "@/components/help-dialog";
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
  const { currentTournament } = useTournament();
  const { isReadOnly, getShareableLink } = useViewMode();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>("points");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [showSummaryPdfViewer, setShowSummaryPdfViewer] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [summaryPdfBlobUrl, setSummaryPdfBlobUrl] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const { toast } = useToast();

  const { data: results, isLoading } = useQuery<Result[]>({
    queryKey: ["/api/results", currentTournament?.id],
    queryFn: async () => {
      if (!currentTournament) return [];
      const response = await fetch(`/api/results?tournamentId=${currentTournament.id}`);
      if (!response.ok) throw new Error("Failed to fetch results");
      return response.json();
    },
    enabled: !!currentTournament,
  });

  const { data: teams } = useQuery<Team[]>({
    queryKey: ["/api/teams", currentTournament?.id],
    queryFn: async () => {
      if (!currentTournament) return [];
      const response = await fetch(`/api/teams?tournamentId=${currentTournament.id}`);
      if (!response.ok) throw new Error("Failed to fetch teams");
      return response.json();
    },
    enabled: !!currentTournament,
  });

  // Auto-open Summary dialog in read-only mode
  // Add a small delay to ensure page is fully rendered, especially on mobile
  useEffect(() => {
    if (isReadOnly && results && results.length > 0) {
      const timer = setTimeout(() => {
        setShowSummary(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isReadOnly, results]);

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

  const groupedByStageAndDivision = useMemo(() => {
    const stageGroups = new Map<string, Map<string, Result[]>>();
    
    getSortedResults.forEach(result => {
      const stage = result.stage;
      const division = result.division || 'No Division';
      
      if (!stageGroups.has(stage)) {
        stageGroups.set(stage, new Map<string, Result[]>());
      }
      
      const divisionGroups = stageGroups.get(stage)!;
      if (!divisionGroups.has(division)) {
        divisionGroups.set(division, []);
      }
      
      divisionGroups.get(division)!.push(result);
    });
    
    // Sort stages in tournament progression order
    const stageOrder = ['initial', 'quarter-finals', 'semi-finals', 'finals'];
    const sortedStages = Array.from(stageGroups.entries()).sort(([a], [b]) => {
      return stageOrder.indexOf(a) - stageOrder.indexOf(b);
    });
    
    // Within each stage, sort divisions alphabetically with "No Division" last
    return sortedStages.map(([stage, divisionGroups]) => {
      const sortedDivisions = Array.from(divisionGroups.entries()).sort(([a], [b]) => {
        if (a === 'No Division') return 1;
        if (b === 'No Division') return -1;
        return a.localeCompare(b);
      });
      return [stage, sortedDivisions] as [string, [string, Result[]][]];
    });
  }, [getSortedResults]);

  const teamSummaries = useMemo(() => {
    if (!filteredResults || filteredResults.length === 0) return [];

    const summaryMap = new Map<string, TeamSummary & { division: string | null }>();

    filteredResults.forEach(result => {
      if (!summaryMap.has(result.teamName)) {
        summaryMap.set(result.teamName, {
          teamName: result.teamName,
          division: result.division,
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
      // Prefer non-null division values (e.g., from initial stage matches)
      // This handles cases where playoff matches have null division
      if (result.division && !summary.division) {
        summary.division = result.division;
      }
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

  const teamSummariesByStageAndDivision = useMemo(() => {
    // Group results by stage and team (use all results, not filtered)
    const stageGroups = new Map<string, Map<string, (TeamSummary & { division: string | null })>>();

    // Add Initial stage with all teams if teams data is available
    if (teams && teams.length > 0) {
      const initialTeamMap = new Map<string, TeamSummary & { division: string | null }>();
      
      // Initialize all teams with zero stats
      teams.forEach(team => {
        initialTeamMap.set(team.name, {
          teamName: team.name,
          division: team.division,
          gamesPlayed: 0,
          gamesWon: 0,
          gamesDrawn: 0,
          gamesLost: 0,
          points: 0,
          scoreFor: 0,
          scoreAgainst: 0,
          scoreDifference: 0,
        });
      });
      
      stageGroups.set('initial', initialTeamMap);
    }

    // Process results and update team stats
    if (results && results.length > 0) {
      results.forEach(result => {
        const stage = result.stage;
        
        if (!stageGroups.has(stage)) {
          stageGroups.set(stage, new Map<string, TeamSummary & { division: string | null }>());
        }
        
        const teamMap = stageGroups.get(stage)!;
        
        if (!teamMap.has(result.teamName)) {
          teamMap.set(result.teamName, {
            teamName: result.teamName,
            division: result.division,
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

        const summary = teamMap.get(result.teamName)!;
        if (result.division && !summary.division) {
          summary.division = result.division;
        }
        summary.gamesPlayed += result.gamesPlayed;
        summary.gamesWon += result.gamesWon;
        summary.gamesLost += result.gamesLost;
        summary.gamesDrawn += result.gamesDrawn;
        summary.points += result.points;
        summary.scoreFor += result.scoreFor;
        summary.scoreAgainst += result.scoreAgainst;
        summary.scoreDifference += result.scoreDifference;
      });
    }

    // If no stages exist, return empty array
    if (stageGroups.size === 0) return [];

    // Sort stages in tournament progression order
    const stageOrder = ['initial', 'quarter-finals', 'semi-finals', 'finals'];
    const sortedStages = Array.from(stageGroups.entries()).sort(([a], [b]) => {
      return stageOrder.indexOf(a) - stageOrder.indexOf(b);
    });

    // For each stage, group teams by division
    return sortedStages.map(([stage, teamMap]) => {
      const allSummaries = Array.from(teamMap.values());
      
      // Separate teams with results from teams without results
      const teamsWithResults = allSummaries.filter(s => s.gamesPlayed > 0);
      const teamsWithoutResults = allSummaries.filter(s => s.gamesPlayed === 0);
      
      // Sort teams with results by points and score difference
      teamsWithResults.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return b.scoreDifference - a.scoreDifference;
      });
      
      // Sort teams without results alphabetically
      teamsWithoutResults.sort((a, b) => a.teamName.localeCompare(b.teamName));
      
      // Combine: teams with results first, then teams without results
      const summaries = [...teamsWithResults, ...teamsWithoutResults];

      const divisionGroups = new Map<string, (TeamSummary & { division: string | null })[]>();
      summaries.forEach(summary => {
        const division = summary.division || 'No Division';
        if (!divisionGroups.has(division)) {
          divisionGroups.set(division, []);
        }
        divisionGroups.get(division)!.push(summary);
      });

      const sortedDivisions = Array.from(divisionGroups.entries()).sort(([a], [b]) => {
        if (a === 'No Division') return 1;
        if (b === 'No Division') return -1;
        return a.localeCompare(b);
      });

      return [stage, sortedDivisions] as [string, [string, (TeamSummary & { division: string | null })[]][]];
    });
  }, [results, teams]);

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
    setIsClearing(true);
    toast({
      title: "Updating - Please Wait",
      description: "Clearing all results...",
    });
    
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
        duration: Infinity,
      });
    } finally {
      setIsClearing(false);
    }
  };

  const handleCopyShareLink = () => {
    const shareLink = getShareableLink(currentTournament?.id);
    navigator.clipboard.writeText(shareLink).then(() => {
      toast({
        title: "Link copied",
        description: "Shareable link copied to clipboard. Anyone with this link can view results in read-only mode.",
        duration: Infinity,
      });
    }).catch((error) => {
      console.error("Failed to copy link:", error);
      toast({
        title: "Error",
        description: "Failed to copy link to clipboard.",
        variant: "destructive",
        duration: Infinity,
      });
    });
  };

  const availableStages = useMemo(() => {
    if (!results) return [];
    const stages = new Set(results.map(r => r.stage));
    return Array.from(stages).sort();
  }, [results]);

  const generateResultsPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    const pageHeight = doc.internal.pageSize.height;
    const bottomMargin = 20;
    
    doc.setFontSize(14);
    doc.text('Match Results Report', 14, 12);
    
    doc.setFontSize(9);
    doc.text(`Tournament: ${currentTournament?.name || 'Unknown'}`, 14, 18);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 23);
    if (stageFilter !== "all") {
      doc.text(`Stage: ${stageLabels[stageFilter as keyof typeof stageLabels]}`, 14, 28);
    }
    
    let startY = stageFilter !== "all" ? 33 : 28;
    
    groupedByStageAndDivision.forEach(([stage, divisions], stageIndex) => {
      // Add stage header
      if (stageIndex > 0) {
        startY += 10; // Add spacing between stages
      }
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(`Stage: ${stageLabels[stage as keyof typeof stageLabels]}`, 14, startY);
      doc.setFont('helvetica', 'normal');
      startY += 6;
      
      divisions.forEach(([division, divisionResults], divIndex) => {
        const divisionLabel = division !== 'No Division' ? `Division ${division}` : 'No Division Assigned';
        
        // Conservative estimate for space needed (accounting for text wrapping)
        // Header (5) + table header (~10) + rows (results.length * ~7 for potential wrapping) + spacing
        const estimatedHeight = 5 + 10 + (divisionResults.length * 7) + 15;
        
        // Check if division will fit on current page (with conservative margin)
        if (startY + estimatedHeight > pageHeight - bottomMargin && divIndex > 0) {
          doc.addPage();
          startY = 20; // Start near top of new page
        } else if (divIndex > 0) {
          startY += 8; // Add spacing between divisions within a stage on same page
        }
        
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(divisionLabel, 14, startY);
        doc.setFont('helvetica', 'normal');
        startY += 5;
        
        const tableData = divisionResults.map((result) => [
          result.teamName,
          result.matchInfo,
          result.matchDate || '—',
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
          head: [['Team', 'Match', 'Date', 'P', 'W', 'D', 'L', 'Pts', 'F', 'A', 'Diff']],
          body: tableData,
          startY: startY,
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
            0: { cellWidth: 50 },
            1: { cellWidth: 70 },
            2: { cellWidth: 22 },
            3: { cellWidth: 10, halign: 'center' },
            4: { cellWidth: 10, halign: 'center' },
            5: { cellWidth: 10, halign: 'center' },
            6: { cellWidth: 10, halign: 'center' },
            7: { cellWidth: 12, halign: 'center' },
            8: { cellWidth: 10, halign: 'center' },
            9: { cellWidth: 10, halign: 'center' },
            10: { cellWidth: 12, halign: 'center' },
          },
        });
        
        // @ts-ignore - autoTable adds finalY to doc
        startY = doc.lastAutoTable.finalY + 5;
      });
    });
    
    return doc;
  };

  const generateSummaryPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    const pageHeight = doc.internal.pageSize.height;
    const bottomMargin = 20;
    
    doc.setFontSize(14);
    doc.text('Team Leaderboard - All Stages', 14, 12);
    
    doc.setFontSize(9);
    doc.text(`Tournament: ${currentTournament?.name || 'Unknown'}`, 14, 18);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 23);
    
    let startY = 28;
    
    teamSummariesByStageAndDivision.forEach(([stage, divisions], stageIndex) => {
      // Add stage header
      if (stageIndex > 0) {
        startY += 10; // Add spacing between stages
      }
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(`Stage: ${stageLabels[stage as keyof typeof stageLabels]}`, 14, startY);
      doc.setFont('helvetica', 'normal');
      startY += 6;
      
      divisions.forEach(([division, divisionSummaries], divIndex) => {
        const divisionLabel = division !== 'No Division' ? `Division ${division}` : 'No Division Assigned';
        
        // Conservative estimate for space needed (accounting for text wrapping)
        // Header (5) + table header (~12) + rows (summaries.length * ~9 for potential wrapping) + spacing
        const estimatedHeight = 5 + 12 + (divisionSummaries.length * 9) + 15;
        
        // Check if division will fit on current page (with conservative margin)
        if (startY + estimatedHeight > pageHeight - bottomMargin && divIndex > 0) {
          doc.addPage();
          startY = 20; // Start near top of new page
        } else if (divIndex > 0) {
          startY += 8; // Add spacing between divisions within a stage on same page
        }
        
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(divisionLabel, 14, startY);
        doc.setFont('helvetica', 'normal');
        startY += 5;
        
        const tableData = divisionSummaries.map((summary) => [
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
          startY: startY,
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
        
        // @ts-ignore - autoTable adds finalY to doc
        startY = doc.lastAutoTable.finalY + 5;
      });
    });
    
    return doc;
  };

  const openPdfViewer = async () => {
    const doc = generateResultsPDF();
    const tournamentName = currentTournament?.name || 'Tournament';
    const filename = `${tournamentName} - Results.pdf`;
    
    if (isMobileDevice()) {
      const success = await openPdfMobile(doc, filename);
      if (!success) {
        toast({
          title: "PDF Error",
          description: "Failed to open PDF. Please try again.",
          variant: "destructive",
          duration: Infinity,
        });
      }
    } else {
      const pdfBlob = doc.output('blob');
      const url = URL.createObjectURL(pdfBlob);
      setPdfBlobUrl(url);
      setShowPdfViewer(true);
    }
  };

  const openSummaryPdfViewer = async () => {
    const doc = generateSummaryPDF();
    const tournamentName = currentTournament?.name || 'Tournament';
    const filename = `${tournamentName} - Summary.pdf`;
    
    if (isMobileDevice()) {
      const success = await openPdfMobile(doc, filename);
      if (!success) {
        toast({
          title: "PDF Error",
          description: "Failed to open PDF. Please try again.",
          variant: "destructive",
          duration: Infinity,
        });
      }
    } else {
      const pdfBlob = doc.output('blob');
      const url = URL.createObjectURL(pdfBlob);
      setSummaryPdfBlobUrl(url);
      setShowSummaryPdfViewer(true);
    }
  };

  const handlePdfSave = (isSummary: boolean) => {
    const doc = isSummary ? generateSummaryPDF() : generateResultsPDF();
    const pdfBlob = doc.output('blob');
    const url = URL.createObjectURL(pdfBlob);
    
    const tournamentName = currentTournament?.name || 'Tournament';
    const pageName = isSummary ? 'Leaderboard' : 'Results';
    const filename = `${tournamentName} - ${pageName}.pdf`;
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
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
                    Leaderboard
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <DialogTitle>
                          Team Leaderboard - All Stages
                        </DialogTitle>
                        <p className="text-sm text-muted-foreground">
                          {currentTournament?.name} • {new Date().toLocaleString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowSummary(false)}
                          data-testid="button-close-summary"
                          aria-label="Close summary"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={openSummaryPdfViewer}
                          data-testid="button-summary-download"
                        >
                          <FileDown className="mr-2 h-4 w-4" />
                          Download
                        </Button>
                      </div>
                    </div>
                  </DialogHeader>
                  <div className="space-y-8">
                    {teamSummariesByStageAndDivision.map(([stage, divisions]) => (
                      <div key={stage} className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Badge variant="default" className="text-lg px-3 py-1.5">
                            {stageLabels[stage as keyof typeof stageLabels]}
                          </Badge>
                        </div>
                        
                        {divisions.map(([division, divisionSummaries]) => (
                          <div key={`${stage}-${division}`}>
                            <div className="mb-3">
                              <h3 className="text-base font-semibold flex items-center gap-2">
                                {division !== 'No Division' && (
                                  <Badge variant="outline" className="px-2 py-1">
                                    Division {division}
                                  </Badge>
                                )}
                                {division === 'No Division' && (
                                  <span>No Division Assigned</span>
                                )}
                                <span className="text-muted-foreground text-sm font-normal">
                                  ({divisionSummaries.length} {divisionSummaries.length === 1 ? 'team' : 'teams'})
                                </span>
                              </h3>
                            </div>
                        <div className="overflow-x-auto">
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
                              {divisionSummaries.map((summary) => (
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
                        </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </DialogContent>
              </Dialog>
              <Button
                variant="outline"
                onClick={openPdfViewer}
                data-testid="button-download"
              >
                <FileDown className="mr-2 h-4 w-4" />
                Download
              </Button>
              {!isReadOnly && (
                <>
                  <Button
                    variant="outline"
                    onClick={handleCopyShareLink}
                    data-testid="button-copy-share-link"
                  >
                    <Share2 className="mr-2 h-4 w-4" />
                    Copy Share Link
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
            </>
          )}
          <HelpDialog title="Results - Help">
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">What is this page?</h3>
                <p>The Results page displays statistics and outcomes from completed matches, showing individual game results and team performance summaries.</p>
              </div>
              
              <div>
                <h3 className="font-semibold mb-2">Viewing Results</h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Leaderboard View:</strong> Click "Leaderboard" to see team rankings with statistics grouped by Stage and Division</li>
                  <li><strong>Detailed Results:</strong> The main table shows individual game results from all completed matches</li>
                  <li><strong>Stage Filter:</strong> Filter results by tournament stage (Initial, Quarter-Finals, Semi-Finals, Finals)</li>
                </ul>
              </div>
              
              <div>
                <h3 className="font-semibold mb-2">Understanding Statistics</h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Points:</strong> Total points earned (2 points per game won, 1 for a draw)</li>
                  <li><strong>Games Played/Won/Drawn/Lost:</strong> Individual game statistics</li>
                  <li><strong>Score For/Against:</strong> Total points scored for and against the team</li>
                  <li><strong>Score Difference:</strong> The difference between points for and against (used for ranking)</li>
                </ul>
              </div>
              
              <div>
                <h3 className="font-semibold mb-2">Team Rankings</h3>
                <p>Teams are ranked by: 1) Total Points, 2) Score Difference. Top teams from each division advance to playoff stages.</p>
              </div>
              
              <div>
                <h3 className="font-semibold mb-2">Other Actions</h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Download:</strong> Generate and download a results report (PDF or Excel)</li>
                  <li><strong>Share View:</strong> Get a short link to share results with others in read-only mode</li>
                  <li><strong>Clear All Results:</strong> Delete all results (warning: this cannot be undone)</li>
                </ul>
              </div>
              
              <div>
                <h3 className="font-semibold mb-2">Sorting</h3>
                <p>Click on column headers to sort results by different statistics (team name, points, scores, etc.)</p>
              </div>
            </div>
          </HelpDialog>
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
        <div className="space-y-8">
          {groupedByStageAndDivision.map(([stage, divisions]) => (
            <div key={stage} className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="default" className="text-xl px-4 py-2">
                  {stageLabels[stage as keyof typeof stageLabels]}
                </Badge>
              </div>
              
              {divisions.map(([division, divisionResults]) => (
                <Card key={`${stage}-${division}`}>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      {division !== 'No Division' && (
                        <Badge variant="outline" className="text-base px-3 py-1">
                          Division {division}
                        </Badge>
                      )}
                      {division === 'No Division' && (
                        <span>No Division Assigned</span>
                      )}
                      <span className="text-muted-foreground text-sm font-normal">
                        ({divisionResults.length} {divisionResults.length === 1 ? 'result' : 'results'})
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <div className="rounded-md border">
                        <Table>
                        <TableHeader>
                          <TableRow>
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
                            onClick={() => handleSort("matchDate")}
                            data-testid="sort-matchDate"
                          >
                            Date
                            <SortIcon column="matchDate" />
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
                      {divisionResults.map((result) => (
                        <TableRow key={result.id} data-testid={`row-result-${result.id}`}>
                          <TableCell data-testid={`text-team-${result.id}`}>
                            {result.teamName}
                          </TableCell>
                          <TableCell data-testid={`text-match-${result.id}`}>
                            {result.matchInfo}
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
              </div>
              </CardContent>
            </Card>
          ))}
            </div>
          ))}
        </div>
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
            <AlertDialogCancel disabled={isClearing} data-testid="button-cancel-clear">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearAllResults}
              disabled={isClearing}
              className="bg-destructive text-destructive-foreground hover-elevate"
              data-testid="button-confirm-clear"
            >
              {isClearing ? "Clearing..." : "Clear All Results"}
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
                onClick={() => pdfBlobUrl && window.open(pdfBlobUrl, '_blank')}
                data-testid="button-open-new-tab-pdf"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open in New Tab
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
            <DialogTitle>Leaderboard Report Preview</DialogTitle>
            <p id="summary-pdf-viewer-description" className="sr-only">
              Preview the PDF leaderboard report before saving or printing
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
                onClick={() => summaryPdfBlobUrl && window.open(summaryPdfBlobUrl, '_blank')}
                data-testid="button-open-new-tab-summary-pdf"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open in New Tab
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
