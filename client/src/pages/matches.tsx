import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTournament } from "@/contexts/TournamentContext";
import { useViewMode } from "@/contexts/ViewModeContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  insertMatchSchema,
  type Team,
  type Match,
  type InsertMatch,
} from "@shared/schema";
import { Plus, Trash2, Shuffle, Check, X, ArrowUpDown, ArrowUp, ArrowDown, Users, Filter, FileDown, Printer, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

const stageLabels = {
  initial: "Initial",
  "quarter-finals": "Quarter-Finals",
  "semi-finals": "Semi-Finals",
  finals: "Finals",
};

const statusLabels = {
  scheduled: "Scheduled",
  "in-progress": "In Progress",
  completed: "Completed",
};

type SortColumn = "division" | "stage" | "status" | "matchDate" | "team1" | "team2";
type SortDirection = "asc" | "desc";

type EditingMatch = {
  team1Game1Score: string;
  team2Game1Score: string;
  team1Game2Score: string;
  team2Game2Score: string;
  team1Game3Score: string;
  team2Game3Score: string;
  matchDate: string;
};

export default function Matches() {
  const { currentTournament } = useTournament();
  const { isReadOnly } = useViewMode();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingValues, setEditingValues] = useState<Partial<EditingMatch>>({});
  const [isEditAllMode, setIsEditAllMode] = useState(false);
  const [allEditingValues, setAllEditingValues] = useState<Record<string, Partial<EditingMatch>>>({});
  const [deletingMatch, setDeletingMatch] = useState<Match | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>("matchDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [divisionFilter, setDivisionFilter] = useState<string>("all");
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: teams, isLoading: teamsLoading } = useQuery<Team[]>({
    queryKey: ["/api/teams", currentTournament?.id],
    queryFn: async () => {
      if (!currentTournament) return [];
      const response = await fetch(`/api/teams?tournamentId=${currentTournament.id}`);
      if (!response.ok) throw new Error("Failed to fetch teams");
      return response.json();
    },
    enabled: !!currentTournament,
  });

  const { data: matches, isLoading } = useQuery<Match[]>({
    queryKey: ["/api/matches", currentTournament?.id],
    queryFn: async () => {
      if (!currentTournament) return [];
      const response = await fetch(`/api/matches?tournamentId=${currentTournament.id}`);
      if (!response.ok) throw new Error("Failed to fetch matches");
      return response.json();
    },
    enabled: !!currentTournament,
  });

  const form = useForm<InsertMatch>({
    resolver: zodResolver(insertMatchSchema),
    defaultValues: {
      team1Id: "",
      team2Id: "",
      stage: "initial",
      status: "scheduled",
      matchDate: null,
      team1Game1Score: null,
      team2Game1Score: null,
      team1Game2Score: null,
      team2Game2Score: null,
      team1Game3Score: null,
      team2Game3Score: null,
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertMatch) => {
      if (!currentTournament) throw new Error("No tournament selected");
      return apiRequest("POST", "/api/matches", { ...data, tournamentId: currentTournament.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/matches", currentTournament?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/results", currentTournament?.id] });
      setIsCreateOpen(false);
      form.reset();
      toast({
        title: "Match created",
        description: "The match has been successfully created.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
        duration: Infinity,
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiRequest("PATCH", `/api/matches/${id}/score`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/matches", currentTournament?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/results", currentTournament?.id] });
      setEditingRowId(null);
      setEditingValues({});
      toast({
        title: "Match updated",
        description: "The match has been successfully updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
        duration: Infinity,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/matches/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/matches", currentTournament?.id] });
      setDeletingMatch(null);
      toast({
        title: "Match deleted",
        description: "The match has been removed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
        duration: Infinity,
      });
    },
  });

  const handleGenerateMatches = async () => {
    if (!currentTournament) {
      toast({
        title: "Error",
        description: "No tournament selected. Please select a tournament first.",
        variant: "destructive",
        duration: Infinity,
      });
      return;
    }
    
    try {
      const res = await apiRequest("POST", "/api/matches/generate", { 
        tournamentId: currentTournament.id 
      });
      const response: {
        created: number;
        updated: number;
        skipped: number;
        warnings?: string[];
        stage: string;
        matches: any[];
      } = await res.json();

      queryClient.invalidateQueries({ queryKey: ["/api/matches", currentTournament?.id] });

      // Map stage names for display
      const stageDisplayNames: Record<string, string> = {
        "initial": "initial round",
        "quarter-finals": "quarter-final",
        "semi-finals": "semi-final",
        "finals": "final",
      };
      const stageName = stageDisplayNames[response.stage] || response.stage;
      
      let message = "";
      
      if (response.created > 0 && response.updated > 0) {
        message = `Created ${response.created} and updated ${response.updated} ${stageName} match(es).`;
        if (response.skipped > 0) {
          message += ` ${response.skipped} match(es) already exist.`;
        }
      } else if (response.created > 0) {
        message = `Successfully created ${response.created} ${stageName} match(es).`;
        if (response.skipped > 0) {
          message += ` ${response.skipped} match(es) already exist.`;
        }
      } else if (response.updated > 0) {
        message = `Successfully updated ${response.updated} ${stageName} match(es) based on current rankings.`;
      } else if (response.skipped > 0) {
        message = `No new matches created. ${response.skipped} match(es) already exist.`;
      } else {
        message = "No matches were created or updated.";
      }

      // Show main toast with success message
      toast({
        title: response.created > 0 || response.updated > 0 ? "Success" : "No changes",
        description: message,
        variant: response.created > 0 || response.updated > 0 ? "default" : "default",
      });

      // Show warnings as separate sticky toasts
      if (response.warnings && response.warnings.length > 0) {
        response.warnings.forEach(warning => {
          toast({
            title: "Notice",
            description: warning,
            duration: Infinity,
          });
        });
      }
    } catch (error) {
      console.error("Error generating matches:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to generate matches.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
        duration: Infinity,
      });
    }
  };

  const handleClearAllMatches = async () => {
    try {
      await apiRequest("DELETE", "/api/matches");
      queryClient.invalidateQueries({ queryKey: ["/api/matches", currentTournament?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/results", currentTournament?.id] });
      setShowClearConfirm(false);
      toast({
        title: "All matches cleared",
        description: "All matches and results have been removed.",
      });
    } catch (error) {
      console.error("Error clearing matches:", error);
      toast({
        title: "Error",
        description: "Failed to clear matches.",
        variant: "destructive",
        duration: Infinity,
      });
    }
  };

  const onSubmit = (data: InsertMatch) => {
    if (data.team1Id === data.team2Id) {
      toast({
        title: "Invalid selection",
        description: "Please select two different teams",
        variant: "destructive",
        duration: Infinity,
      });
      return;
    }
    createMutation.mutate(data);
  };

  const startEditing = (match: Match) => {
    setEditingRowId(match.id);
    setEditingValues({
      team1Game1Score: match.team1Game1Score !== null ? match.team1Game1Score.toString() : "",
      team2Game1Score: match.team2Game1Score !== null ? match.team2Game1Score.toString() : "",
      team1Game2Score: match.team1Game2Score !== null ? match.team1Game2Score.toString() : "",
      team2Game2Score: match.team2Game2Score !== null ? match.team2Game2Score.toString() : "",
      team1Game3Score: match.team1Game3Score !== null ? match.team1Game3Score.toString() : "",
      team2Game3Score: match.team2Game3Score !== null ? match.team2Game3Score.toString() : "",
      matchDate: match.matchDate || "",
    });
  };

  const cancelEditing = () => {
    setEditingRowId(null);
    setEditingValues({});
  };

  const saveEditing = (matchId: string) => {
    // Parse all game scores, keeping null for empty values
    // Use !== "" to allow 0 as a valid score
    const team1Game1Score = editingValues.team1Game1Score?.trim() !== "" 
      ? parseInt(editingValues.team1Game1Score!) 
      : null;
    const team2Game1Score = editingValues.team2Game1Score?.trim() !== "" 
      ? parseInt(editingValues.team2Game1Score!) 
      : null;
    const team1Game2Score = editingValues.team1Game2Score?.trim() !== "" 
      ? parseInt(editingValues.team1Game2Score!) 
      : null;
    const team2Game2Score = editingValues.team2Game2Score?.trim() !== "" 
      ? parseInt(editingValues.team2Game2Score!) 
      : null;
    const team1Game3Score = editingValues.team1Game3Score?.trim() !== "" 
      ? parseInt(editingValues.team1Game3Score!) 
      : null;
    const team2Game3Score = editingValues.team2Game3Score?.trim() !== "" 
      ? parseInt(editingValues.team2Game3Score!) 
      : null;
    const matchDate = editingValues.matchDate?.trim() || null;

    // Validate that for each game, if one score is provided, both must be provided
    if ((team1Game1Score !== null && team2Game1Score === null) || 
        (team1Game1Score === null && team2Game1Score !== null)) {
      toast({
        title: "Invalid scores",
        description: "Please provide both scores for Game 1 or leave both empty.",
        variant: "destructive",
        duration: Infinity,
      });
      return;
    }

    if ((team1Game2Score !== null && team2Game2Score === null) || 
        (team1Game2Score === null && team2Game2Score !== null)) {
      toast({
        title: "Invalid scores",
        description: "Please provide both scores for Game 2 or leave both empty.",
        variant: "destructive",
        duration: Infinity,
      });
      return;
    }

    if ((team1Game3Score !== null && team2Game3Score === null) || 
        (team1Game3Score === null && team2Game3Score !== null)) {
      toast({
        title: "Invalid scores",
        description: "Please provide both scores for Game 3 or leave both empty.",
        variant: "destructive",
        duration: Infinity,
      });
      return;
    }

    // Validate all scores are non-negative integers
    const scores = [
      { value: team1Game1Score, name: "Team 1 Game 1" },
      { value: team2Game1Score, name: "Team 2 Game 1" },
      { value: team1Game2Score, name: "Team 1 Game 2" },
      { value: team2Game2Score, name: "Team 2 Game 2" },
      { value: team1Game3Score, name: "Team 1 Game 3" },
      { value: team2Game3Score, name: "Team 2 Game 3" },
    ];

    for (const score of scores) {
      if (score.value !== null && (isNaN(score.value) || score.value < 0)) {
        toast({
          title: "Invalid score",
          description: `${score.name} score must be a non-negative number.`,
          variant: "destructive",
          duration: Infinity,
        });
        return;
      }
    }

    updateMutation.mutate({
      id: matchId,
      data: {
        team1Game1Score,
        team2Game1Score,
        team1Game2Score,
        team2Game2Score,
        team1Game3Score,
        team2Game3Score,
        matchDate,
      },
    });
  };

  const validateScore = (field: keyof EditingMatch, value: string, currentValues: Partial<EditingMatch>): { valid: boolean; message?: string } => {
    // Allow empty values
    if (value === "") return { valid: true };
    
    const numValue = parseInt(value, 10);
    
    // Check if it's a score field
    if (!field.includes("Score")) return { valid: true };
    
    // Validate range (0-13)
    if (isNaN(numValue) || numValue < 0) {
      return { valid: false, message: "Score must be 0 or greater" };
    }
    if (numValue > 13) {
      return { valid: false, message: "Maximum score is 13" };
    }
    
    // Check if score is 13, opponent must have less than 13
    if (numValue === 13) {
      // Determine which game and team this is
      const gameNum = field.includes("Game1") ? "1" : field.includes("Game2") ? "2" : "3";
      const isTeam1 = field.includes("team1");
      const opponentField = (isTeam1 ? `team2Game${gameNum}Score` : `team1Game${gameNum}Score`) as keyof EditingMatch;
      const opponentScore = currentValues[opponentField];
      
      if (opponentScore && parseInt(opponentScore, 10) >= 13) {
        return { valid: false, message: "If one team scores 13, opponent must score less than 13" };
      }
    }
    
    // Check if opponent has 13, this score must be less than 13
    const gameNum = field.includes("Game1") ? "1" : field.includes("Game2") ? "2" : "3";
    const isTeam1 = field.includes("team1");
    const opponentField = (isTeam1 ? `team2Game${gameNum}Score` : `team1Game${gameNum}Score`) as keyof EditingMatch;
    const opponentScore = currentValues[opponentField];
    
    if (opponentScore && parseInt(opponentScore, 10) === 13 && numValue >= 13) {
      return { valid: false, message: "If opponent scores 13, this team must score less than 13" };
    }
    
    return { valid: true };
  };

  const updateEditingValue = (field: keyof EditingMatch, value: string) => {
    const validation = validateScore(field, value, editingValues);
    if (!validation.valid) {
      toast({
        title: "Invalid Score",
        description: validation.message,
        variant: "destructive",
        duration: 3000,
      });
      return;
    }
    setEditingValues(prev => ({ ...prev, [field]: value }));
  };

  const updateAllEditingValue = (matchId: string, field: keyof EditingMatch, value: string) => {
    const currentMatchValues = allEditingValues[matchId] || {};
    const validation = validateScore(field, value, currentMatchValues);
    if (!validation.valid) {
      toast({
        title: "Invalid Score",
        description: validation.message,
        variant: "destructive",
        duration: 3000,
      });
      return;
    }
    setAllEditingValues(prev => ({
      ...prev,
      [matchId]: {
        ...prev[matchId],
        [field]: value
      }
    }));
  };

  const toggleEditAllMode = () => {
    if (isEditAllMode) {
      // Exiting edit all mode - save all changes
      saveAllEdits();
    } else {
      // Entering edit all mode - initialize editing values for all matches
      const initialValues: Record<string, Partial<EditingMatch>> = {};
      getFilteredAndSortedMatches.forEach(match => {
        initialValues[match.id] = {
          team1Game1Score: match.team1Game1Score !== null ? match.team1Game1Score.toString() : "",
          team2Game1Score: match.team2Game1Score !== null ? match.team2Game1Score.toString() : "",
          team1Game2Score: match.team1Game2Score !== null ? match.team1Game2Score.toString() : "",
          team2Game2Score: match.team2Game2Score !== null ? match.team2Game2Score.toString() : "",
          team1Game3Score: match.team1Game3Score !== null ? match.team1Game3Score.toString() : "",
          team2Game3Score: match.team2Game3Score !== null ? match.team2Game3Score.toString() : "",
          matchDate: match.matchDate || "",
        };
      });
      setAllEditingValues(initialValues);
      setIsEditAllMode(true);
    }
  };

  const saveAllEdits = async () => {
    const matchesToUpdate = getFilteredAndSortedMatches.filter(match => 
      allEditingValues[match.id] !== undefined
    );

    let successCount = 0;
    const errors: string[] = [];

    for (const match of matchesToUpdate) {
      const values = allEditingValues[match.id];
      if (!values) continue;

      const matchLabel = `${getTeamName(match.team1Id)} vs ${getTeamName(match.team2Id)}`;

      try {
        // Parse scores
        const team1Game1Score = values.team1Game1Score?.trim() !== "" ? parseInt(values.team1Game1Score!) : null;
        const team2Game1Score = values.team2Game1Score?.trim() !== "" ? parseInt(values.team2Game1Score!) : null;
        const team1Game2Score = values.team1Game2Score?.trim() !== "" ? parseInt(values.team1Game2Score!) : null;
        const team2Game2Score = values.team2Game2Score?.trim() !== "" ? parseInt(values.team2Game2Score!) : null;
        const team1Game3Score = values.team1Game3Score?.trim() !== "" ? parseInt(values.team1Game3Score!) : null;
        const team2Game3Score = values.team2Game3Score?.trim() !== "" ? parseInt(values.team2Game3Score!) : null;
        const matchDate = values.matchDate?.trim() || null;

        // Validate paired scores for each game
        if ((team1Game1Score !== null && team2Game1Score === null) || 
            (team1Game1Score === null && team2Game1Score !== null)) {
          errors.push(`${matchLabel}: Both Game 1 scores must be provided or both left empty`);
          continue;
        }

        if ((team1Game2Score !== null && team2Game2Score === null) || 
            (team1Game2Score === null && team2Game2Score !== null)) {
          errors.push(`${matchLabel}: Both Game 2 scores must be provided or both left empty`);
          continue;
        }

        if ((team1Game3Score !== null && team2Game3Score === null) || 
            (team1Game3Score === null && team2Game3Score !== null)) {
          errors.push(`${matchLabel}: Both Game 3 scores must be provided or both left empty`);
          continue;
        }

        // Validate all scores are non-negative integers
        const scores = [
          { value: team1Game1Score, name: `Game 1` },
          { value: team2Game1Score, name: `Game 1` },
          { value: team1Game2Score, name: `Game 2` },
          { value: team2Game2Score, name: `Game 2` },
          { value: team1Game3Score, name: `Game 3` },
          { value: team2Game3Score, name: `Game 3` },
        ];

        let hasInvalidScore = false;
        for (const score of scores) {
          if (score.value !== null && (isNaN(score.value) || score.value < 0)) {
            errors.push(`${matchLabel}: ${score.name} score must be a non-negative number`);
            hasInvalidScore = true;
            break;
          }
        }

        if (hasInvalidScore) {
          continue;
        }

        // Update the match
        await apiRequest("PATCH", `/api/matches/${match.id}/score`, {
          team1Game1Score,
          team2Game1Score,
          team1Game2Score,
          team2Game2Score,
          team1Game3Score,
          team2Game3Score,
          matchDate,
        });

        successCount++;
      } catch (error) {
        errors.push(`${matchLabel}: Failed to save changes`);
      }
    }

    // Only invalidate and exit edit mode if there were successful updates or no errors
    if (successCount > 0 || errors.length > 0) {
      await queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/results"] });
    }

    if (successCount > 0 && errors.length === 0) {
      // All updates successful - exit edit mode
      toast({
        title: "Matches updated",
        description: `Successfully updated ${successCount} match${successCount > 1 ? 'es' : ''}.`,
      });
      setIsEditAllMode(false);
      setAllEditingValues({});
    } else if (successCount > 0 && errors.length > 0) {
      // Some succeeded, some failed - show partial success and stay in edit mode
      toast({
        title: "Partially updated",
        description: `Updated ${successCount} match${successCount > 1 ? 'es' : ''}. ${errors.length} failed: ${errors[0]}${errors.length > 1 ? ` (+${errors.length - 1} more)` : ''}`,
        variant: "destructive",
        duration: Infinity,
      });
      // Stay in edit mode so user can fix errors
    } else if (errors.length > 0) {
      // All failed - show error and stay in edit mode
      toast({
        title: "Update failed",
        description: errors.length === 1 ? errors[0] : `${errors.length} errors: ${errors[0]} (+${errors.length - 1} more)`,
        variant: "destructive",
        duration: Infinity,
      });
      // Stay in edit mode so user can fix errors
    }
  };

  const getTeamName = (teamId: string) => {
    const team = teams?.find(t => t.id === teamId);
    return team?.name || "Unknown Team";
  };

  // Get unique divisions from matches
  const availableDivisions = useMemo(() => {
    if (!matches) return [];
    const divisions = new Set(matches.map(m => m.division).filter(Boolean));
    return Array.from(divisions).sort();
  }, [matches]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const getFilteredAndSortedMatches = useMemo(() => {
    if (!matches) return [];

    // Filter matches
    let filtered = matches.filter(match => {
      const stageMatch = stageFilter === "all" || match.stage === stageFilter;
      const divisionMatch = divisionFilter === "all" || match.division === divisionFilter;
      return stageMatch && divisionMatch;
    });

    // Sort matches
    const sorted = [...filtered].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortColumn) {
        case "division":
          aValue = (a.division || "ZZZ").toLowerCase();
          bValue = (b.division || "ZZZ").toLowerCase();
          break;
        case "team1":
          aValue = getTeamName(a.team1Id).toLowerCase();
          bValue = getTeamName(b.team1Id).toLowerCase();
          break;
        case "team2":
          aValue = getTeamName(a.team2Id).toLowerCase();
          bValue = getTeamName(b.team2Id).toLowerCase();
          break;
        case "matchDate":
          aValue = a.matchDate || "9999-12-31";
          bValue = b.matchDate || "9999-12-31";
          break;
        default:
          aValue = (a[sortColumn] || "").toString().toLowerCase();
          bValue = (b[sortColumn] || "").toString().toLowerCase();
      }

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [matches, sortColumn, sortDirection, stageFilter, divisionFilter, teams]);

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-4 w-4 ml-1 text-muted-foreground" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="h-4 w-4 ml-1" />
    ) : (
      <ArrowDown className="h-4 w-4 ml-1" />
    );
  };

  const generatePDFDocument = () => {
    // Use landscape orientation for better fit, with compression to reduce size
    const doc = new jsPDF({ 
      orientation: 'landscape',
      compress: true
    });
    
    // Add title
    doc.setFontSize(16);
    doc.text("Boules League - Matches Report", 14, 15);
    
    // Add generation date
    doc.setFontSize(9);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 22);
    
    // Prepare table data to match on-screen form columns
    const tableData = getFilteredAndSortedMatches.map(match => {
      const team1 = getTeamName(match.team1Id);
      const team2 = getTeamName(match.team2Id);
      const division = match.division || "-";
      const stage = stageLabels[match.stage as keyof typeof stageLabels];
      const status = statusLabels[match.status as keyof typeof statusLabels];
      const matchDate = match.matchDate 
        ? new Date(match.matchDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : "-";
      
      // Individual game scores (matching form layout)
      const t1g1 = match.team1Game1Score !== null ? match.team1Game1Score.toString() : "-";
      const t1g2 = match.team1Game2Score !== null ? match.team1Game2Score.toString() : "-";
      const t1g3 = match.team1Game3Score !== null ? match.team1Game3Score.toString() : "-";
      const t2g1 = match.team2Game1Score !== null ? match.team2Game1Score.toString() : "-";
      const t2g2 = match.team2Game2Score !== null ? match.team2Game2Score.toString() : "-";
      const t2g3 = match.team2Game3Score !== null ? match.team2Game3Score.toString() : "-";
      
      return [
        division,
        stage,
        status,
        matchDate,
        team1,
        t1g1,
        t1g2,
        t1g3,
        team2,
        t2g1,
        t2g2,
        t2g3
      ];
    });
    
    // Add table with columns matching on-screen form
    autoTable(doc, {
      head: [[
        'Div',
        'Stage',
        'Status',
        'Date',
        'Team 1',
        'G1',
        'G2',
        'G3',
        'Team 2',
        'G1',
        'G2',
        'G3'
      ]],
      body: tableData,
      startY: 28,
      styles: { 
        fontSize: 8, 
        cellPadding: 1.5,
        overflow: 'linebreak'
      },
      headStyles: { 
        fillColor: [59, 130, 246], 
        textColor: 255,
        fontStyle: 'bold'
      },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },  // Div
        1: { cellWidth: 22 },                     // Stage
        2: { cellWidth: 20 },                     // Status
        3: { cellWidth: 24 },                     // Date
        4: { cellWidth: 40 },                     // Team 1
        5: { cellWidth: 12, halign: 'center' },  // Team 1 Game 1
        6: { cellWidth: 12, halign: 'center' },  // Team 1 Game 2
        7: { cellWidth: 12, halign: 'center' },  // Team 1 Game 3
        8: { cellWidth: 40 },                     // Team 2
        9: { cellWidth: 12, halign: 'center' },  // Team 2 Game 1
        10: { cellWidth: 12, halign: 'center' }, // Team 2 Game 2
        11: { cellWidth: 12, halign: 'center' }  // Team 2 Game 3
      },
    });
    
    return doc;
  };

  const openPdfViewer = () => {
    // Clean up any existing blob URL first (not data URLs)
    if (pdfBlobUrl && pdfBlobUrl.startsWith('blob:')) {
      URL.revokeObjectURL(pdfBlobUrl);
    }
    
    const doc = generatePDFDocument();
    
    // Detect mobile devices - use data URL instead of blob URL for better mobile compatibility
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    let pdfUrl: string;
    if (isMobile) {
      // Data URL works better on mobile browsers (especially Android)
      pdfUrl = doc.output('dataurlstring');
    } else {
      // Blob URL for desktop (more efficient)
      pdfUrl = doc.output('bloburl') as unknown as string;
    }
    
    setPdfBlobUrl(pdfUrl);
    setShowPdfViewer(true);
  };

  const handlePdfSave = () => {
    const doc = generatePDFDocument();
    const pdfBlob = doc.output('blob');
    const url = URL.createObjectURL(pdfBlob);
    
    // Create download link - browser handles save location based on user's browser settings
    // Note: Whether the browser shows a save dialog is controlled by browser settings
    // (e.g., Chrome: "Ask where to save each file before downloading")
    // By default, most browsers save to Downloads folder without prompting
    const link = document.createElement('a');
    link.href = url;
    link.download = `matches-report-${new Date().toISOString().split('T')[0]}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up the URL after a short delay
    setTimeout(() => URL.revokeObjectURL(url), 100);
    
    toast({
      title: "PDF saved",
      description: "The PDF has been downloaded to your default downloads folder.",
    });
  };

  const handlePdfPrint = () => {
    if (pdfBlobUrl) {
      const printWindow = window.open(pdfBlobUrl, '_blank');
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
      }
    }
  };

  const closePdfViewer = () => {
    setShowPdfViewer(false);
    if (pdfBlobUrl) {
      // Only revoke blob URLs, not data URLs
      if (pdfBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(pdfBlobUrl);
      }
      setPdfBlobUrl(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-r-transparent"></div>
          <p className="text-sm text-muted-foreground">Loading matches...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Matches</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isReadOnly ? "View matches and results" : "Schedule matches and record results"}
            </p>
          </div>
          <div className="flex gap-2">
            {!isReadOnly && (
              <>
                <Button
                  variant={isEditAllMode ? "default" : "outline"}
                  onClick={toggleEditAllMode}
                  data-testid="button-edit-all"
                >
                  {isEditAllMode ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Save All
                    </>
                  ) : (
                    <>
                      <Users className="h-4 w-4 mr-2" />
                      Edit All
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleGenerateMatches}
                  data-testid="button-generate-matches"
                >
                  <Shuffle className="h-4 w-4 mr-2" />
                  Generate Matches
                </Button>
              </>
            )}
            <Button
              variant="outline"
              onClick={openPdfViewer}
              data-testid="button-view-pdf"
            >
              <FileDown className="h-4 w-4 mr-2" />
              View PDF Report
            </Button>
            {!isReadOnly && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setShowClearConfirm(true)}
                  data-testid="button-clear-all-matches"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear All Data
                </Button>
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-create-match">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Match
                    </Button>
                  </DialogTrigger>
              <DialogContent aria-describedby="match-form-description">
                <DialogHeader>
                  <DialogTitle>Create New Match</DialogTitle>
                  <p id="match-form-description" className="sr-only">
                    Select two teams and choose a tournament stage to schedule a new match
                  </p>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                      control={form.control}
                      name="team1Id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Team 1</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-team1">
                                <SelectValue placeholder="Select first team" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {teams?.map((team) => (
                                <SelectItem key={team.id} value={team.id}>
                                  {team.name} {team.division && `(Division ${team.division})`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="team2Id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Team 2</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-team2">
                                <SelectValue placeholder="Select second team" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {teams?.map((team) => (
                                <SelectItem key={team.id} value={team.id}>
                                  {team.name} {team.division && `(Division ${team.division})`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="stage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Stage</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-stage">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="initial">Initial Stage</SelectItem>
                              <SelectItem value="quarter-finals">Quarter-Finals</SelectItem>
                              <SelectItem value="semi-finals">Semi-Finals</SelectItem>
                              <SelectItem value="finals">Finals</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex gap-2 pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsCreateOpen(false)}
                        className="flex-1"
                        data-testid="button-cancel"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        className="flex-1"
                        disabled={createMutation.isPending}
                        data-testid="button-submit-match"
                      >
                        {createMutation.isPending ? "Creating..." : "Create Match"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
                </Dialog>
              </>
            )}
          </div>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="py-4">
            <div className="flex items-center gap-4">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <div className="flex gap-4 flex-1">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-foreground whitespace-nowrap">Stage:</label>
                  <Select value={stageFilter} onValueChange={setStageFilter}>
                    <SelectTrigger className="w-[180px]" data-testid="select-stage-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Stages</SelectItem>
                      <SelectItem value="initial">Initial</SelectItem>
                      <SelectItem value="quarter-finals">Quarter-Finals</SelectItem>
                      <SelectItem value="semi-finals">Semi-Finals</SelectItem>
                      <SelectItem value="finals">Finals</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-foreground whitespace-nowrap">Division:</label>
                  <Select value={divisionFilter} onValueChange={setDivisionFilter}>
                    <SelectTrigger className="w-[180px]" data-testid="select-division-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Divisions</SelectItem>
                      {availableDivisions.map(div => (
                        <SelectItem key={div} value={div as string}>
                          Division {div}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Helper Info */}
        <Alert className="mb-6 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800" data-testid="alert-match-completion-guide">
          <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <AlertDescription className="text-sm text-blue-900 dark:text-blue-100">
            <strong>How to complete matches and create results:</strong> Each match consists of up to 3 games. 
            A match completes when one team wins <strong>2 games</strong> or when all 3 games are played. 
            <strong>Points are awarded per game:</strong> 2 points for a win, 1 for a draw, 0 for a loss. 
            Results appear only when match status becomes <strong>"Completed"</strong>.
          </AlertDescription>
        </Alert>

        {!matches || matches.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="rounded-full bg-muted p-6 mb-4">
                <Users className="h-12 w-12 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                No matches scheduled yet
              </h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
                {isReadOnly 
                  ? "No matches have been created for this tournament yet" 
                  : "Create your first match or generate matches automatically from your teams"}
              </p>
              {!isReadOnly && (
                <div className="flex gap-2">
                  <Button onClick={handleGenerateMatches} variant="outline" data-testid="button-generate-first-matches">
                    <Shuffle className="h-4 w-4 mr-2" />
                    Generate Matches
                  </Button>
                  <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-first-match">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Match
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ) : getFilteredAndSortedMatches.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="rounded-full bg-muted p-6 mb-4">
                <Filter className="h-12 w-12 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                No matches match the current filters
              </h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
                Try adjusting your filters to see more matches
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">
                      <button
                        className="flex items-center hover-elevate active-elevate-2 font-medium -ml-3 px-3 py-1 rounded"
                        onClick={() => handleSort("division")}
                        data-testid="sort-division"
                      >
                        Division
                        <SortIcon column="division" />
                      </button>
                    </TableHead>
                    <TableHead className="w-[140px]">
                      <button
                        className="flex items-center hover-elevate active-elevate-2 font-medium -ml-3 px-3 py-1 rounded"
                        onClick={() => handleSort("stage")}
                        data-testid="sort-stage"
                      >
                        Stage
                        <SortIcon column="stage" />
                      </button>
                    </TableHead>
                    <TableHead className="w-[120px]">
                      <button
                        className="flex items-center hover-elevate active-elevate-2 font-medium -ml-3 px-3 py-1 rounded"
                        onClick={() => handleSort("status")}
                        data-testid="sort-status"
                      >
                        Status
                        <SortIcon column="status" />
                      </button>
                    </TableHead>
                    <TableHead className="w-[120px]">
                      <button
                        className="flex items-center hover-elevate active-elevate-2 font-medium -ml-3 px-3 py-1 rounded"
                        onClick={() => handleSort("matchDate")}
                        data-testid="sort-date"
                      >
                        Date
                        <SortIcon column="matchDate" />
                      </button>
                    </TableHead>
                    <TableHead className="w-[180px]">
                      <button
                        className="flex items-center hover-elevate active-elevate-2 font-medium -ml-3 px-3 py-1 rounded"
                        onClick={() => handleSort("team1")}
                        data-testid="sort-team1"
                      >
                        Team 1
                        <SortIcon column="team1" />
                      </button>
                    </TableHead>
                    <TableHead className="w-[70px] text-center">Game 1</TableHead>
                    <TableHead className="w-[70px] text-center">Game 2</TableHead>
                    <TableHead className="w-[70px] text-center">Game 3</TableHead>
                    <TableHead className="w-[180px]">
                      <button
                        className="flex items-center hover-elevate active-elevate-2 font-medium -ml-3 px-3 py-1 rounded"
                        onClick={() => handleSort("team2")}
                        data-testid="sort-team2"
                      >
                        Team 2
                        <SortIcon column="team2" />
                      </button>
                    </TableHead>
                    <TableHead className="w-[70px] text-center">Game 1</TableHead>
                    <TableHead className="w-[70px] text-center">Game 2</TableHead>
                    <TableHead className="w-[70px] text-center">Game 3</TableHead>
                    {!isReadOnly && (
                      <TableHead className="w-[120px] text-right">Actions</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {getFilteredAndSortedMatches.map((match) => {
                    const isEditing = editingRowId === match.id;
                    const isEditingInBulk = isEditAllMode && allEditingValues[match.id];
                    const shouldShowInputs = isEditing || isEditingInBulk;
                    const currentValues = isEditingInBulk ? allEditingValues[match.id] : editingValues;
                    const updateValue = isEditingInBulk 
                      ? (field: keyof EditingMatch, value: string) => updateAllEditingValue(match.id, field, value)
                      : updateEditingValue;

                    return (
                      <TableRow key={match.id} data-testid={`row-match-${match.id}`}>
                        <TableCell>
                          {match.division ? (
                            <Badge variant="outline" data-testid={`badge-division-${match.id}`}>
                              {match.division}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" data-testid={`badge-stage-${match.id}`}>
                            {stageLabels[match.stage as keyof typeof stageLabels]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={
                              match.status === "completed" ? "default" : 
                              match.status === "in-progress" ? "secondary" : 
                              "outline"
                            }
                            data-testid={`badge-status-${match.id}`}
                          >
                            {statusLabels[match.status as keyof typeof statusLabels]}
                          </Badge>
                        </TableCell>
                        <TableCell data-testid={`text-date-${match.id}`}>
                          {shouldShowInputs ? (
                            <Input
                              type="date"
                              value={currentValues?.matchDate || ""}
                              onChange={(e) => updateValue("matchDate", e.target.value)}
                              className="h-8 w-36"
                              data-testid={`input-edit-date-${match.id}`}
                            />
                          ) : match.matchDate ? (
                            <span className="text-sm">
                              {new Date(match.matchDate).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell data-testid={`text-team1-${match.id}`}>
                          {getTeamName(match.team1Id)}
                        </TableCell>
                        <TableCell className="text-center">
                          {shouldShowInputs ? (
                            <Input
                              type="number"
                              min="0"
                              max="13"
                              value={currentValues?.team1Game1Score || ""}
                              onChange={(e) => updateValue("team1Game1Score", e.target.value)}
                              className="h-8 w-14 text-center"
                              placeholder="0"
                              data-testid={`input-edit-team1-game1-${match.id}`}
                            />
                          ) : (
                            <span className="font-mono text-sm" data-testid={`text-team1-game1-${match.id}`}>
                              {match.team1Game1Score ?? "—"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {shouldShowInputs ? (
                            <Input
                              type="number"
                              min="0"
                              max="13"
                              value={currentValues?.team1Game2Score || ""}
                              onChange={(e) => updateValue("team1Game2Score", e.target.value)}
                              className="h-8 w-14 text-center"
                              placeholder="0"
                              data-testid={`input-edit-team1-game2-${match.id}`}
                            />
                          ) : (
                            <span className="font-mono text-sm" data-testid={`text-team1-game2-${match.id}`}>
                              {match.team1Game2Score ?? "—"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {shouldShowInputs ? (
                            <Input
                              type="number"
                              min="0"
                              max="13"
                              value={currentValues?.team1Game3Score || ""}
                              onChange={(e) => updateValue("team1Game3Score", e.target.value)}
                              className="h-8 w-14 text-center"
                              placeholder="0"
                              data-testid={`input-edit-team1-game3-${match.id}`}
                            />
                          ) : (
                            <span className="font-mono text-sm" data-testid={`text-team1-game3-${match.id}`}>
                              {match.team1Game3Score ?? "—"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell data-testid={`text-team2-${match.id}`}>
                          {getTeamName(match.team2Id)}
                        </TableCell>
                        <TableCell className="text-center">
                          {shouldShowInputs ? (
                            <Input
                              type="number"
                              min="0"
                              max="13"
                              value={currentValues?.team2Game1Score || ""}
                              onChange={(e) => updateValue("team2Game1Score", e.target.value)}
                              className="h-8 w-14 text-center"
                              placeholder="0"
                              data-testid={`input-edit-team2-game1-${match.id}`}
                            />
                          ) : (
                            <span className="font-mono text-sm" data-testid={`text-team2-game1-${match.id}`}>
                              {match.team2Game1Score ?? "—"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {shouldShowInputs ? (
                            <Input
                              type="number"
                              min="0"
                              max="13"
                              value={currentValues?.team2Game2Score || ""}
                              onChange={(e) => updateValue("team2Game2Score", e.target.value)}
                              className="h-8 w-14 text-center"
                              placeholder="0"
                              data-testid={`input-edit-team2-game2-${match.id}`}
                            />
                          ) : (
                            <span className="font-mono text-sm" data-testid={`text-team2-game2-${match.id}`}>
                              {match.team2Game2Score ?? "—"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {shouldShowInputs ? (
                            <Input
                              type="number"
                              min="0"
                              max="13"
                              value={currentValues?.team2Game3Score || ""}
                              onChange={(e) => updateValue("team2Game3Score", e.target.value)}
                              className="h-8 w-14 text-center"
                              placeholder="0"
                              data-testid={`input-edit-team2-game3-${match.id}`}
                            />
                          ) : (
                            <span className="font-mono text-sm" data-testid={`text-team2-game3-${match.id}`}>
                              {match.team2Game3Score ?? "—"}
                            </span>
                          )}
                        </TableCell>
                        {!isReadOnly && (
                          <TableCell className="text-right">
                            {isEditAllMode ? (
                              // Hide individual actions in Edit All mode
                              <span className="text-muted-foreground text-sm">—</span>
                            ) : isEditing ? (
                              <div className="flex gap-1 justify-end">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => saveEditing(match.id)}
                                  disabled={updateMutation.isPending}
                                  data-testid={`button-save-${match.id}`}
                                >
                                  <Check className="h-4 w-4 text-green-600" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={cancelEditing}
                                  disabled={updateMutation.isPending}
                                  data-testid={`button-cancel-edit-${match.id}`}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex gap-1 justify-end">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => startEditing(match)}
                                  data-testid={`button-edit-${match.id}`}
                                >
                                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                  </svg>
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => setDeletingMatch(match)}
                                  data-testid={`button-delete-${match.id}`}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}

        <AlertDialog open={!!deletingMatch} onOpenChange={(open) => !open && setDeletingMatch(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Match</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this match? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deletingMatch && deleteMutation.mutate(deletingMatch.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear All Matches</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete all matches? This action cannot be undone and will remove all matches and their results.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-clear-matches">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleClearAllMatches}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-clear-matches"
              >
                Clear All Matches
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={showPdfViewer} onOpenChange={(open) => !open && closePdfViewer()}>
          <DialogContent className="max-w-4xl h-[90vh]" aria-describedby="pdf-viewer-description">
            <DialogHeader>
              <DialogTitle>Matches Report Preview</DialogTitle>
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
                  onClick={handlePdfSave}
                  data-testid="button-save-pdf"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Save
                </Button>
                <Button
                  variant="outline"
                  onClick={handlePdfPrint}
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
      </div>
    </div>
  );
}
