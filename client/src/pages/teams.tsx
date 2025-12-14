import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { isMobileDevice, openPdfMobile } from "@/lib/utils";
import { useTournament } from "@/contexts/TournamentContext";
import { useViewMode } from "@/contexts/ViewModeContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTeamSchema, type Team, type InsertTeam } from "@shared/schema";
import { Plus, Trash2, Users, Upload, Check, X, ArrowUpDown, ArrowUp, ArrowDown, FileDown, Download, Printer, Share2, Copy, Mail, ExternalLink, FileSpreadsheet, MessageCircle, Trophy } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { HelpDialog } from "@/components/help-dialog";
import * as XLSX from "xlsx";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type SortColumn = "teamDisplayId" | "name" | "division" | "captainName" | "captainPhone" | "captainEmail" | "homePiste" | "otherPlayers";
type SortDirection = "asc" | "desc";

interface EditingTeam extends Partial<InsertTeam> {
  id?: string;
  isNew?: boolean;
}

// Helper function to format phone number for WhatsApp
function formatPhoneForWhatsApp(phone: string): string {
  // Remove all non-digit characters (including +, spaces, dashes, etc.)
  let digitsOnly = phone.replace(/\D/g, '');
  
  // If empty, return as is
  if (!digitsOnly) return digitsOnly;
  
  // Check if it starts with 00 (international dialing prefix)
  // This means it already has a country code, just strip the 00
  if (digitsOnly.startsWith('00')) {
    return digitsOnly.substring(2);
  }
  
  // Check if it starts with single 0 (UK national format)
  if (digitsOnly.startsWith('0')) {
    // Remove leading 0 and add UK country code (44)
    return '44' + digitsOnly.substring(1);
  }
  
  // If it's a short number (less than 10 digits) and doesn't start with a country code,
  // assume it's a UK number without the leading 0
  if (digitsOnly.length < 10) {
    return '44' + digitsOnly;
  }
  
  // If it's 10 digits and starts with 7 (UK mobile without 0), add 44
  if (digitsOnly.length === 10 && digitsOnly.startsWith('7')) {
    return '44' + digitsOnly;
  }
  
  // Otherwise, assume it already has a country code
  return digitsOnly;
}

// Helper function to create WhatsApp URL
function getWhatsAppUrl(phone: string): string {
  const formatted = formatPhoneForWhatsApp(phone);
  return `https://wa.me/${formatted}`;
}

// Helper function to create mailto URL with tournament subject
function getMailtoUrl(email: string, tournamentName: string): string {
  const subject = encodeURIComponent(`Re: ${tournamentName}`);
  return `mailto:${email}?subject=${subject}`;
}

export default function Teams() {
  const { currentTournament } = useTournament();
  const { isReadOnly } = useViewMode();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingValues, setEditingValues] = useState<Partial<InsertTeam>>({});
  const [deletingTeam, setDeletingTeam] = useState<Team | null>(null);
  const [deletionImpact, setDeletionImpact] = useState<{ matchCount: number; resultCount: number } | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [divisionFilter, setDivisionFilter] = useState<string>("all");
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [isSharingLink, setIsSharingLink] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentTournamentRef = useRef<string | null>(null);
  const { toast } = useToast();
  
  // Edit All mode state
  const [isEditAllMode, setIsEditAllMode] = useState(false);
  const [allEditingValues, setAllEditingValues] = useState<Record<string, EditingTeam>>({});
  const [newTeamCounter, setNewTeamCounter] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  
  // Keep ref in sync with currentTournament to avoid stale closures
  useEffect(() => {
    currentTournamentRef.current = currentTournament?.id || null;
  }, [currentTournament]);

  const { data: teams, isLoading } = useQuery<Team[]>({
    queryKey: ["/api/teams", currentTournament?.id],
    queryFn: async () => {
      if (!currentTournament) return [];
      const response = await apiRequest("GET", `/api/teams?tournamentId=${currentTournament.id}`);
      return response.json();
    },
    enabled: !!currentTournament,
  });

  const form = useForm<InsertTeam>({
    resolver: zodResolver(insertTeamSchema),
    defaultValues: {
      tournamentId: "",
      teamDisplayId: "",
      name: "",
      captainName: "",
      captainPhone: "",
      captainEmail: "",
      division: "A",
      homePiste: "",
      otherPlayers: [],
    },
  });

  // Update tournamentId whenever currentTournament changes
  useEffect(() => {
    if (currentTournament) {
      form.setValue("tournamentId", currentTournament.id);
    }
  }, [currentTournament, form]);

  const createMutation = useMutation({
    mutationFn: async (data: InsertTeam) => {
      const response = await apiRequest("POST", "/api/teams", data);
      return (await response.json()) as Team;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", currentTournament?.id] });
      setIsCreateOpen(false);
      form.reset({
        tournamentId: currentTournament?.id || "",
        teamDisplayId: "",
        name: "",
        captainName: "",
        captainPhone: "",
        captainEmail: "",
        division: "A",
        homePiste: "",
        otherPlayers: [],
      });
      toast({
        title: "Team registered",
        description: "The team has been successfully registered.",
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
    mutationFn: ({ id, data }: { id: string; data: InsertTeam }) => {
      if (!currentTournament) throw new Error("No tournament selected");
      return apiRequest("PATCH", `/api/teams/${id}`, { ...data, tournamentId: currentTournament.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", currentTournament?.id] });
      setEditingRowId(null);
      setEditingValues({});
      toast({
        title: "Team updated",
        description: "The team has been successfully updated.",
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

  const handleDeleteClick = async (team: Team) => {
    try {
      const response = await apiRequest("GET", `/api/teams/${team.id}/deletion-impact`);
      const impact = await response.json();
      setDeletionImpact(impact);
      setDeletingTeam(team);
    } catch (error) {
      console.error("Error fetching deletion impact:", error);
      toast({
        title: "Error",
        description: "Failed to check deletion impact. Please try again.",
        variant: "destructive",
        duration: Infinity,
      });
    }
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/teams/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/results"] });
      setDeletingTeam(null);
      setDeletionImpact(null);
      toast({
        title: "Team deleted",
        description: "The team and all associated matches and results have been removed.",
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

  const handleClearAllTeams = async () => {
    try {
      await apiRequest("DELETE", "/api/teams");
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/results"] });
      setShowClearConfirm(false);
      toast({
        title: "All data cleared",
        description: "All teams, matches, and results have been removed.",
      });
    } catch (error) {
      console.error("Error clearing teams:", error);
      toast({
        title: "Error",
        description: "Failed to clear teams.",
        variant: "destructive",
        duration: Infinity,
      });
    }
  };

  const handleExcelImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const resetFileInput = () => {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    };

    if (!currentTournamentRef.current) {
      toast({
        title: "Error",
        description: "No tournament selected. Please select a tournament first.",
        variant: "destructive",
        duration: Infinity,
      });
      resetFileInput();
      return;
    }

    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Get the first sheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to JSON with defval to handle empty cells
        const teamsData = XLSX.utils.sheet_to_json(worksheet, { 
          defval: "",
          raw: false 
        }) as Array<Record<string, any>>;

        if (teamsData.length === 0) {
          toast({
            title: "No data found",
            description: "The spreadsheet appears to be empty or has no valid rows.",
            variant: "destructive",
            duration: Infinity,
          });
          resetFileInput();
          return;
        }

        let successCount = 0;
        let errorCount = 0;
        const errors: string[] = [];

        for (let i = 0; i < teamsData.length; i++) {
          const row = teamsData[i];
          const rowNum = i + 2; // +2 because Excel is 1-indexed and has header row
          
          // Try to find column values with case-insensitive matching
          const getName = () => {
            const nameKey = Object.keys(row).find(k => 
              k.toLowerCase() === 'name' ||
              k.toLowerCase() === 'team name' ||
              k.toLowerCase() === 'teamname' ||
              k.toLowerCase() === 'team_name'
            );
            return nameKey ? row[nameKey] : null;
          };
          
          const getCaptainName = () => {
            const key = Object.keys(row).find(k => 
              k.toLowerCase() === 'captainname' || 
              k.toLowerCase() === 'captain name' ||
              k.toLowerCase() === 'captain_name'
            );
            return key ? row[key] : null;
          };
          
          const getCaptainPhone = () => {
            const key = Object.keys(row).find(k => 
              k.toLowerCase() === 'captainphone' || 
              k.toLowerCase() === 'captain phone' ||
              k.toLowerCase() === 'captain_phone' ||
              k.toLowerCase() === 'phone'
            );
            return key ? row[key] : null;
          };
          
          const getCaptainEmail = () => {
            const key = Object.keys(row).find(k => 
              k.toLowerCase() === 'captainemail' || 
              k.toLowerCase() === 'captain email' ||
              k.toLowerCase() === 'captain_email' ||
              k.toLowerCase() === 'email'
            );
            return key ? row[key] : null;
          };
          
          const getDivision = () => {
            const key = Object.keys(row).find(k => k.toLowerCase() === 'division');
            return key ? row[key] : null;
          };
          
          const getHomePiste = () => {
            const key = Object.keys(row).find(k => 
              k.toLowerCase() === 'homepiste' || 
              k.toLowerCase() === 'home piste' ||
              k.toLowerCase() === 'home_piste' ||
              k.toLowerCase() === 'piste'
            );
            return key ? row[key] : null;
          };
          
          const getOtherPlayers = () => {
            const key = Object.keys(row).find(k => 
              k.toLowerCase() === 'otherplayers' || 
              k.toLowerCase() === 'other players' ||
              k.toLowerCase() === 'other_players'
            );
            return key ? row[key] : null;
          };
          
          const getTeamDisplayId = () => {
            const key = Object.keys(row).find(k => 
              k.toLowerCase() === 'teamdisplayid' || 
              k.toLowerCase() === 'team display id' ||
              k.toLowerCase() === 'team_display_id' ||
              k.toLowerCase() === 'team id' ||
              k.toLowerCase() === 'teamid' ||
              k.toLowerCase() === 'team_id' ||
              k.toLowerCase() === 'id'
            );
            return key ? row[key] : null;
          };

          const name = getName();
          const captainName = getCaptainName();
          const captainPhone = getCaptainPhone();
          const captainEmail = getCaptainEmail();
          const division = getDivision();
          const homePiste = getHomePiste();
          const otherPlayers = getOtherPlayers();
          const teamDisplayId = getTeamDisplayId();

          // Check if row is completely empty (skip empty rows)
          const hasAnyData = Object.values(row).some(val => 
            val !== null && val !== undefined && String(val).trim() !== ""
          );
          
          if (!hasAnyData) {
            continue; // Skip completely empty rows without counting as error
          }

          // Validate required fields
          const missingFields: string[] = [];
          if (!name || String(name).trim() === "") missingFields.push("name");
          if (!captainName || String(captainName).trim() === "") missingFields.push("captainName");
          if (!captainPhone || String(captainPhone).trim() === "") missingFields.push("captainPhone");
          
          if (missingFields.length > 0) {
            errorCount++;
            errors.push(`Row ${rowNum}: Missing ${missingFields.join(", ")}`);
            continue;
          }

          try {
            if (!currentTournamentRef.current) {
              errorCount++;
              errors.push(`Row ${rowNum}: No tournament selected`);
              continue;
            }
            
            const teamData: InsertTeam = {
              tournamentId: currentTournamentRef.current,
              teamDisplayId: teamDisplayId && String(teamDisplayId).trim() !== ""
                ? String(teamDisplayId).trim()
                : null,
              name: String(name).trim(),
              captainName: String(captainName).trim(),
              captainPhone: String(captainPhone).trim(),
              captainEmail: captainEmail && String(captainEmail).trim() !== "" 
                ? String(captainEmail).trim() 
                : null,
              division: division && String(division).trim() !== "" 
                ? String(division).trim().toUpperCase() 
                : "A",
              homePiste: homePiste && String(homePiste).trim() !== "" 
                ? String(homePiste).trim() 
                : null,
              otherPlayers: otherPlayers && String(otherPlayers).trim() !== ""
                ? String(otherPlayers).split(/[,\n]/).map(p => p.trim()).filter(p => p)
                : null,
            };

            const existingTeam = teams?.find(t => t.name.toLowerCase() === teamData.name.toLowerCase());
            
            if (existingTeam) {
              await apiRequest("PATCH", `/api/teams/${existingTeam.id}`, teamData);
            } else {
              await apiRequest("POST", "/api/teams", teamData);
            }
            successCount++;
          } catch (error) {
            errorCount++;
            const errorMsg = error instanceof Error ? error.message : "Unknown error";
            errors.push(`Row ${rowNum}: ${errorMsg}`);
          }
        }

        // Invalidate only the current tournament's teams
        if (currentTournamentRef.current) {
          queryClient.invalidateQueries({ 
            queryKey: ["/api/teams", currentTournamentRef.current] 
          });
        }

        // Show detailed results
        let description = `Successfully imported ${successCount} team(s).`;
        if (errorCount > 0) {
          description += ` ${errorCount} row(s) failed.`;
          if (errors.length <= 5) {
            description += ` Errors: ${errors.join("; ")}`;
          } else {
            description += ` First 5 errors: ${errors.slice(0, 5).join("; ")}`;
          }
        }

        toast({
          title: "Import complete",
          description,
          variant: errorCount > 0 ? "destructive" : "default",
          duration: errorCount > 0 ? Infinity : undefined,
        });
      } catch (error) {
        console.error("Import error:", error);
        toast({
          title: "Import failed",
          description: error instanceof Error ? error.message : "Failed to parse Excel file.",
          variant: "destructive",
          duration: Infinity,
        });
      }

      resetFileInput();
    };

    reader.onerror = () => {
      toast({
        title: "Import failed",
        description: "Failed to read Excel file.",
        variant: "destructive",
        duration: Infinity,
      });
      resetFileInput();
    };

    reader.readAsArrayBuffer(file);
  };


  const onSubmit = (data: InsertTeam) => {
    if (!currentTournament) {
      toast({
        title: "Error",
        description: "No tournament selected. Please select a tournament first.",
        variant: "destructive",
        duration: Infinity,
      });
      return;
    }
    
    const newTeamDisplayId = data.teamDisplayId?.trim() || null;
    
    // Check for duplicate Team ID (if one is provided)
    if (newTeamDisplayId && teams) {
      const duplicateTeam = teams.find(t => 
        t.teamDisplayId?.toLowerCase() === newTeamDisplayId.toLowerCase()
      );
      if (duplicateTeam) {
        toast({
          title: "Duplicate Team ID",
          description: `Team ID "${newTeamDisplayId}" is already used by "${duplicateTeam.name}".`,
          variant: "destructive",
          duration: Infinity,
        });
        // Focus on the Team ID input in the form
        const teamIdInput = document.querySelector('input[name="teamDisplayId"]') as HTMLInputElement;
        if (teamIdInput) {
          teamIdInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => teamIdInput.focus(), 100);
        }
        return;
      }
    }
    
    const teamData: InsertTeam = {
      tournamentId: currentTournament.id,
      teamDisplayId: newTeamDisplayId,
      name: data.name.trim(),
      captainName: data.captainName.trim(),
      captainPhone: data.captainPhone.trim(),
      captainEmail: data.captainEmail?.trim() || null,
      division: data.division?.trim().toUpperCase() || "A",
      homePiste: data.homePiste?.trim() || null,
      otherPlayers: data.otherPlayers && data.otherPlayers.length > 0 
        ? data.otherPlayers.map(p => p.trim()).filter(p => p)
        : null,
    };
    
    createMutation.mutate(teamData);
  };

  const startEditing = (team: Team) => {
    setEditingRowId(team.id);
    setEditingValues({
      teamDisplayId: team.teamDisplayId || "",
      name: team.name,
      captainName: team.captainName,
      captainPhone: team.captainPhone,
      captainEmail: team.captainEmail || "",
      division: team.division || "A",
      homePiste: team.homePiste || "",
      otherPlayers: team.otherPlayers || [],
    });
  };

  const cancelEditing = () => {
    setEditingRowId(null);
    setEditingValues({});
  };

  const saveEditing = (teamId: string) => {
    if (!currentTournament) {
      toast({
        title: "Error",
        description: "No tournament selected. Please select a tournament first.",
        variant: "destructive",
        duration: Infinity,
      });
      return;
    }
    
    const newTeamDisplayId = editingValues.teamDisplayId?.trim() || null;
    
    // Check for duplicate Team ID (if one is provided)
    if (newTeamDisplayId && teams) {
      const duplicateTeam = teams.find(t => 
        t.id !== teamId && 
        t.teamDisplayId?.toLowerCase() === newTeamDisplayId.toLowerCase()
      );
      if (duplicateTeam) {
        toast({
          title: "Duplicate Team ID",
          description: `Team ID "${newTeamDisplayId}" is already used by "${duplicateTeam.name}".`,
          variant: "destructive",
          duration: Infinity,
        });
        // Focus on the Team ID input
        const teamIdInput = document.querySelector(`input[data-testid="input-teamDisplayId-${teamId}"]`) as HTMLInputElement;
        if (teamIdInput) {
          teamIdInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => teamIdInput.focus(), 100);
        }
        return;
      }
    }
    
    const teamData: InsertTeam = {
      tournamentId: currentTournament.id,
      teamDisplayId: newTeamDisplayId,
      name: editingValues.name?.trim() || "",
      captainName: editingValues.captainName?.trim() || "",
      captainPhone: editingValues.captainPhone?.trim() || "",
      captainEmail: editingValues.captainEmail?.trim() || null,
      division: editingValues.division?.trim().toUpperCase() || "A",
      homePiste: editingValues.homePiste?.trim() || null,
      otherPlayers: editingValues.otherPlayers && editingValues.otherPlayers.length > 0
        ? editingValues.otherPlayers.map(p => p.trim()).filter(p => p)
        : null,
    };
    
    updateMutation.mutate({ id: teamId, data: teamData });
  };

  const updateEditingValue = (field: keyof InsertTeam, value: string | string[]) => {
    setEditingValues(prev => ({ ...prev, [field]: value }));
  };

  const updateAllEditingValue = (teamId: string, field: keyof EditingTeam, value: string | string[]) => {
    setAllEditingValues(prev => ({
      ...prev,
      [teamId]: {
        ...prev[teamId],
        [field]: value
      }
    }));
  };

  const toggleEditAllMode = () => {
    if (isEditAllMode) {
      // Exiting edit all mode - save all changes
      saveAllEdits();
    } else {
      // Entering edit all mode - initialize editing values for all teams
      const initialValues: Record<string, EditingTeam> = {};
      getSortedTeams().forEach(team => {
        initialValues[team.id] = {
          id: team.id,
          teamDisplayId: team.teamDisplayId || "",
          name: team.name,
          captainName: team.captainName,
          captainPhone: team.captainPhone,
          captainEmail: team.captainEmail || "",
          division: team.division || "A",
          homePiste: team.homePiste || "",
          otherPlayers: team.otherPlayers || [],
          isNew: false,
        };
      });
      setAllEditingValues(initialValues);
      setNewTeamCounter(0);
      setIsEditAllMode(true);
    }
  };

  const cancelEditAllMode = () => {
    setAllEditingValues({});
    setNewTeamCounter(0);
    setIsEditAllMode(false);
  };

  const addNewTeam = () => {
    const newId = `new-${newTeamCounter}`;
    setAllEditingValues(prev => ({
      ...prev,
      [newId]: {
        id: newId,
        teamDisplayId: "",
        name: "",
        captainName: "",
        captainPhone: "",
        captainEmail: "",
        division: "A",
        homePiste: "",
        otherPlayers: [],
        isNew: true,
      }
    }));
    setNewTeamCounter(prev => prev + 1);
  };

  const removeNewTeam = (teamId: string) => {
    setAllEditingValues(prev => {
      const updated = { ...prev };
      delete updated[teamId];
      return updated;
    });
  };

  const saveAllEdits = async () => {
    if (!currentTournament) {
      toast({
        title: "Error",
        description: "No tournament selected.",
        variant: "destructive",
        duration: Infinity,
      });
      return;
    }

    const teamsToProcess = Object.values(allEditingValues);
    
    // Check for duplicate Team IDs before saving
    const teamIdMap = new Map<string, { teamId: string; teamName: string }>();
    let duplicateFound: { teamId: string; displayId: string; existingTeamName: string } | null = null;
    
    for (const teamData of teamsToProcess) {
      const teamDisplayId = teamData.teamDisplayId?.trim()?.toLowerCase();
      if (teamDisplayId) {
        const existing = teamIdMap.get(teamDisplayId);
        if (existing) {
          duplicateFound = { 
            teamId: teamData.id || "", 
            displayId: teamData.teamDisplayId?.trim() || "", 
            existingTeamName: existing.teamName 
          };
          break;
        }
        teamIdMap.set(teamDisplayId, { 
          teamId: teamData.id || "", 
          teamName: teamData.name?.trim() || "Unknown" 
        });
      }
    }
    
    if (duplicateFound) {
      toast({
        title: "Duplicate Team ID",
        description: `Team ID "${duplicateFound.displayId}" is used by multiple teams including "${duplicateFound.existingTeamName}".`,
        variant: "destructive",
        duration: Infinity,
      });
      // Focus on the duplicate Team ID input
      const teamIdInput = document.querySelector(`input[data-testid="input-editall-teamDisplayId-${duplicateFound.teamId}"]`) as HTMLInputElement;
      if (teamIdInput) {
        teamIdInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => teamIdInput.focus(), 100);
      }
      return;
    }
    
    setIsSaving(true);
    toast({
      title: "Updating - Please Wait",
      description: `Saving ${teamsToProcess.length} team${teamsToProcess.length > 1 ? 's' : ''}...`,
    });
    
    let successCount = 0;
    const errors: string[] = [];

    for (const teamData of teamsToProcess) {
      const teamLabel = teamData.name?.trim() || (teamData.isNew ? "New team" : "Unknown");
      
      try {
        // Validate required fields
        if (!teamData.name?.trim()) {
          errors.push(`${teamLabel}: Team name is required`);
          continue;
        }
        if (!teamData.captainName?.trim()) {
          errors.push(`${teamLabel}: Captain name is required`);
          continue;
        }
        if (!teamData.captainPhone?.trim()) {
          errors.push(`${teamLabel}: Captain phone is required`);
          continue;
        }

        const finalTeamData: InsertTeam = {
          tournamentId: currentTournament.id,
          teamDisplayId: teamData.teamDisplayId?.trim() || null,
          name: teamData.name.trim(),
          captainName: teamData.captainName.trim(),
          captainPhone: teamData.captainPhone.trim(),
          captainEmail: teamData.captainEmail?.trim() || null,
          division: teamData.division?.trim().toUpperCase() || "A",
          homePiste: teamData.homePiste?.trim() || null,
          otherPlayers: teamData.otherPlayers && Array.isArray(teamData.otherPlayers) && teamData.otherPlayers.length > 0
            ? teamData.otherPlayers.map(p => p.trim()).filter(p => p)
            : null,
        };

        if (teamData.isNew) {
          // Create new team
          await apiRequest("POST", "/api/teams", finalTeamData);
        } else {
          // Update existing team
          await apiRequest("PATCH", `/api/teams/${teamData.id}`, finalTeamData);
        }
        
        successCount++;
      } catch (error) {
        errors.push(`${teamLabel}: ${error instanceof Error ? error.message : "Failed to save"}`);
      }
    }

    // Invalidate queries and exit edit mode if there were successful updates
    if (successCount > 0) {
      await queryClient.invalidateQueries({ queryKey: ["/api/teams", currentTournament.id] });
      await queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/results"] });
    }

    setIsSaving(false);

    if (successCount > 0 && errors.length === 0) {
      // All updates successful - exit edit mode
      setIsEditAllMode(false);
      setAllEditingValues({});
      setNewTeamCounter(0);
      toast({
        title: "Teams saved",
        description: `Successfully saved ${successCount} team${successCount > 1 ? 's' : ''}.`,
      });
    } else if (successCount > 0 && errors.length > 0) {
      // Some succeeded, some failed - show partial success and stay in edit mode
      toast({
        title: "Partially saved",
        description: `Saved ${successCount} team${successCount > 1 ? 's' : ''}. ${errors.length} failed: ${errors[0]}${errors.length > 1 ? ` (+${errors.length - 1} more)` : ''}`,
        variant: "destructive",
        duration: Infinity,
      });
    } else if (errors.length > 0) {
      // All failed - show error and stay in edit mode
      toast({
        title: "Save failed",
        description: errors.length === 1 ? errors[0] : `${errors.length} errors: ${errors[0]} (+${errors.length - 1} more)`,
        variant: "destructive",
        duration: Infinity,
      });
    }
  };

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const getSortedTeams = () => {
    if (!teams) return [];
    
    const sorted = [...teams].sort((a, b) => {
      let aValue: any;
      let bValue: any;
      
      switch (sortColumn) {
        case "division":
          aValue = (a.division || "").toLowerCase();
          bValue = (b.division || "").toLowerCase();
          // Empty divisions go to end regardless of sort direction
          if (!aValue && bValue) return 1;
          if (aValue && !bValue) return -1;
          break;
        case "teamDisplayId":
          aValue = (a.teamDisplayId || "").toLowerCase();
          bValue = (b.teamDisplayId || "").toLowerCase();
          // Empty team IDs go to end
          if (!aValue && bValue) return 1;
          if (aValue && !bValue) return -1;
          break;
        case "name":
          aValue = (a.name || "").toLowerCase();
          bValue = (b.name || "").toLowerCase();
          break;
        case "captainName":
          aValue = (a.captainName || "").toLowerCase();
          bValue = (b.captainName || "").toLowerCase();
          break;
        case "captainPhone":
          aValue = (a.captainPhone || "").toLowerCase();
          bValue = (b.captainPhone || "").toLowerCase();
          break;
        case "captainEmail":
          aValue = (a.captainEmail || "").toLowerCase();
          bValue = (b.captainEmail || "").toLowerCase();
          break;
        case "homePiste":
          aValue = (a.homePiste || "").toLowerCase();
          bValue = (b.homePiste || "").toLowerCase();
          // Empty home piste go to end
          if (!aValue && bValue) return 1;
          if (aValue && !bValue) return -1;
          break;
        case "otherPlayers":
          aValue = (a.otherPlayers && a.otherPlayers.length > 0 ? a.otherPlayers.join(", ") : "").toLowerCase();
          bValue = (b.otherPlayers && b.otherPlayers.length > 0 ? b.otherPlayers.join(", ") : "").toLowerCase();
          // Empty other players go to end
          if (!aValue && bValue) return 1;
          if (aValue && !bValue) return -1;
          break;
        default:
          return 0;
      }
      
      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
    
    return sorted;
  };

  const groupedByDivision = useMemo(() => {
    const groups = new Map<string, Team[]>();
    
    getSortedTeams().forEach(team => {
      const division = team.division || 'No Division';
      if (!groups.has(division)) {
        groups.set(division, []);
      }
      groups.get(division)!.push(team);
    });
    
    // Sort divisions alphabetically (A, B, C, etc.), with "No Division" last
    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === 'No Division') return 1;
      if (b === 'No Division') return -1;
      return a.localeCompare(b);
    });
  }, [teams, sortColumn, sortDirection]);

  const filteredGroupedByDivision = useMemo(() => {
    if (divisionFilter === "all") {
      return groupedByDivision;
    }
    return groupedByDivision.filter(([division]) => division === divisionFilter);
  }, [groupedByDivision, divisionFilter]);

  const availableDivisions = useMemo(() => {
    return groupedByDivision.map(([division]) => division);
  }, [groupedByDivision]);

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
    const doc = new jsPDF({ orientation: 'landscape' });
    const pageHeight = doc.internal.pageSize.height;
    const bottomMargin = 20;
    
    // Add tournament name as main title
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(currentTournament?.name || 'Tournament', 14, 12);
    doc.setFont('helvetica', 'normal');
    
    // Add description if present
    let teamsHeaderY = 18;
    if (currentTournament?.description) {
      doc.setFontSize(10);
      doc.text(currentTournament.description, 14, teamsHeaderY);
      teamsHeaderY += 5;
    }
    
    // Add report type and generation date
    doc.setFontSize(9);
    doc.text(`Teams Report - Generated: ${new Date().toLocaleString()}`, 14, teamsHeaderY);
    
    let startY = teamsHeaderY + 6;
    
    filteredGroupedByDivision.forEach(([division, divisionTeams], index) => {
      const divisionLabel = division !== 'No Division' ? `Division ${division}` : 'No Division Assigned';
      
      // Conservative estimate for space needed (accounting for text wrapping)
      // Header (5) + table header (~10) + rows (teams.length * ~10 for potential wrapping) + spacing
      const estimatedHeight = 5 + 10 + (divisionTeams.length * 10) + 15;
      
      // Check if division will fit on current page (with conservative margin)
      if (startY + estimatedHeight > pageHeight - bottomMargin && index > 0) {
        doc.addPage();
        startY = 20; // Start near top of new page
      } else if (index > 0) {
        startY += 10; // Add spacing between divisions on same page
      }
      
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(divisionLabel, 14, startY);
      doc.setFont('helvetica', 'normal');
      startY += 5;
      
      const tableData = divisionTeams.map((team) => [
        team.teamDisplayId || '—',
        team.name,
        team.homePiste || '—',
        team.captainName,
        team.captainPhone,
        team.captainEmail || '—',
        team.otherPlayers && team.otherPlayers.length > 0 ? team.otherPlayers.join(', ') : '—',
      ]);
      
      let isFirstPageForDivision = true;
      autoTable(doc, {
        head: [['ID', 'Team Name', 'Home Piste', 'Captain Name', 'Phone', 'Email', 'Other Players']],
        body: tableData,
        startY: startY,
        margin: { top: 25, bottom: 10, left: 14, right: 14 },
        styles: {
          fontSize: 9,
          cellPadding: 2,
        },
        headStyles: {
          fillColor: [41, 128, 185],
          textColor: 255,
          fontStyle: 'bold',
        },
        columnStyles: {
          0: { cellWidth: 20 },
          1: { cellWidth: 42 },
          2: { cellWidth: 30 },
          3: { cellWidth: 38 },
          4: { cellWidth: 30 },
          5: { cellWidth: 45 },
          6: { cellWidth: 47 },
        },
        didDrawPage: function (data) {
          if (!isFirstPageForDivision) {
            // Draw division header in the margin area on continuation pages
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text(divisionLabel, 14, 22);
            doc.setFont('helvetica', 'normal');
          }
          isFirstPageForDivision = false;
        }
      });
      
      // @ts-ignore - autoTable adds finalY to doc
      startY = doc.lastAutoTable.finalY + 5;
    });
    
    return doc;
  };

  const openPdfViewer = async () => {
    if (filteredGroupedByDivision.length === 0) {
      toast({
        title: "No teams to export",
        description: divisionFilter === "all" 
          ? "There are no teams to include in the PDF." 
          : "There are no teams in the selected division.",
        variant: "destructive",
        duration: Infinity,
      });
      return;
    }
    
    const doc = generatePDFDocument();
    const tournamentName = currentTournament?.name || 'Tournament';
    const filename = `${tournamentName} - Teams.pdf`;
    
    if (isMobileDevice()) {
      const success = openPdfMobile(doc, filename);
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

  const handleExcelSave = () => {
    if (!filteredGroupedByDivision) return;
    
    const exportData: any[] = [];
    filteredGroupedByDivision.forEach(([division, divisionTeams]) => {
      divisionTeams.forEach(team => {
        exportData.push({
          Division: division,
          "Team ID": team.teamDisplayId || "",
          "Team Name": team.name,
          "Captain Name": team.captainName || "",
          "Captain Phone": team.captainPhone || "",
          "Captain Email": team.captainEmail || "",
          "Home Piste": team.homePiste || "",
          "Other Players": team.otherPlayers ? team.otherPlayers.join(", ") : "",
        });
      });
    });
    
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Teams");
    
    const tournamentName = currentTournament?.name || 'Tournament';
    const filename = `${tournamentName} - Teams.xlsx`;
    XLSX.writeFile(workbook, filename);
    
    toast({
      title: "Excel saved",
      description: "The Excel file has been downloaded to your default downloads folder.",
    });
  };

  const handlePdfSave = () => {
    const doc = generatePDFDocument();
    const pdfBlob = doc.output('blob');
    const url = URL.createObjectURL(pdfBlob);
    
    const tournamentName = currentTournament?.name || 'Tournament';
    const filename = `${tournamentName} - Teams.pdf`;
    
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

  const handleCopyShareLink = async () => {
    if (!currentTournament) return;
    
    setIsSharingLink(true);
    
    try {
      // Create a short link using our internal system - links to Teams page
      const response = await apiRequest('POST', '/api/short-links', {
        tournamentId: currentTournament.id,
        targetPage: 'teams'
      });
      
      const data = await response.json();
      const shortUrl = data.shortUrl;
      
      await navigator.clipboard.writeText(shortUrl);
      
      toast({
        title: "Link copied",
        description: `Short link copied: ${shortUrl}`,
        duration: 5000,
      });
    } catch (error) {
      console.error("Failed to copy link:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to copy link to clipboard.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
        duration: Infinity,
      });
    } finally {
      setIsSharingLink(false);
    }
  };

  const handleEmailCaptains = () => {
    if (filteredGroupedByDivision.length === 0) {
      toast({
        title: "No teams to email",
        description: divisionFilter === "all" 
          ? "There are no teams registered yet." 
          : `No teams found in Division ${divisionFilter}.`,
        variant: "destructive",
        duration: Infinity,
      });
      return;
    }

    const filteredTeams = filteredGroupedByDivision.flatMap(([_, teams]) => teams);
    const teamsWithEmail = filteredTeams.filter(team => team.captainEmail?.trim());
    const emailAddresses = teamsWithEmail.map(team => team.captainEmail!.trim());

    if (emailAddresses.length === 0) {
      const teamCount = filteredTeams.length;
      toast({
        title: "No email addresses available",
        description: divisionFilter === "all" 
          ? `None of the ${teamCount} registered team${teamCount === 1 ? '' : 's'} have captain email addresses.`
          : `None of the ${teamCount} team${teamCount === 1 ? '' : 's'} in Division ${divisionFilter} have captain email addresses.`,
        variant: "destructive",
        duration: Infinity,
      });
      return;
    }

    const subject = encodeURIComponent(`Re: ${currentTournament?.name || "Tournament"}`);
    
    // For large numbers of recipients, warn about potential issues
    if (emailAddresses.length > 50) {
      toast({
        title: "Too many recipients",
        description: "Your email client may not support this many recipients. Consider sending in smaller batches.",
        variant: "destructive",
        duration: Infinity,
      });
      return;
    }
    
    // Use semicolon separator for Outlook/Windows compatibility
    const mailtoLink = `mailto:${emailAddresses.join(';')}?subject=${subject}`;
    
    console.log('Opening email client with recipients:', emailAddresses.length, 'teams');
    console.log('mailto link length:', mailtoLink.length, 'characters');
    
    // Use anchor element click - more reliable on iOS and other mobile platforms
    // window.location.href doesn't work consistently on iOS Safari
    try {
      const link = document.createElement('a');
      link.href = mailtoLink;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Show confirmation after a brief delay (so it appears after the email client opens)
      setTimeout(() => {
        toast({
          title: "Email client opened",
          description: `${emailAddresses.length} captain${emailAddresses.length === 1 ? '' : 's'} added to recipients. Check your email application.`,
          duration: 5000,
        });
      }, 500);
    } catch (error) {
      console.error('Failed to open email client:', error);
      toast({
        title: "Error opening email client",
        description: "Failed to open your default email application. Please check your system settings.",
        variant: "destructive",
        duration: Infinity,
      });
    }
  };

  const closePdfViewer = () => {
    setShowPdfViewer(false);
    if (pdfBlobUrl) {
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
          <p className="text-sm text-muted-foreground">Loading teams...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Teams</h1>
              {teams && teams.length > 0 && (
                <Badge variant="secondary" className="font-mono" data-testid="badge-team-count">
                  {teams.length}
                </Badge>
              )}
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {isReadOnly ? "View registered teams and captain contact details" : "Manage registered teams and captain contact details"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!isReadOnly && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleExcelImport}
                  className="hidden"
                  data-testid="input-excel-file"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="button-import-excel"
                >
                  <Upload className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Import Excel</span>
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={openPdfViewer}
              data-testid="button-download"
            >
              <FileDown className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Download</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleEmailCaptains}
              data-testid="button-email-captains"
            >
              <Mail className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Email</span>
            </Button>
            {!isReadOnly && (
              <>
                {teams && teams.length > 0 && !isEditAllMode && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleEditAllMode}
                    data-testid="button-edit-all"
                  >
                    <svg className="h-4 w-4 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    <span className="hidden sm:inline">Edit All</span>
                  </Button>
                )}
                {isEditAllMode && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={cancelEditAllMode}
                      disabled={isSaving}
                      data-testid="button-cancel-edit-all"
                    >
                      <X className="h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">Cancel</span>
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={toggleEditAllMode}
                      disabled={isSaving}
                      data-testid="button-save-all"
                    >
                      <Check className="h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">{isSaving ? "Saving..." : "Save All"}</span>
                    </Button>
                  </>
                )}
                {!isEditAllMode && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowClearConfirm(true)}
                    data-testid="button-clear-all-teams"
                  >
                    <Trash2 className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Clear All Data</span>
                  </Button>
                )}
                {!isEditAllMode && (
                  <>
                    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" data-testid="button-add-team">
                          <Plus className="h-4 w-4 sm:mr-2" />
                          <span className="hidden sm:inline">Add Team</span>
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col" aria-describedby="team-form-description">
                <DialogHeader className="flex-shrink-0">
                  <DialogTitle>Register New Team</DialogTitle>
                  <p id="team-form-description" className="sr-only">
                    Enter team name and captain contact information to register a new team
                  </p>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6 overflow-hidden flex-1">
                    <div className="overflow-y-auto flex-1 -mx-6 px-6">
                      <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Team Name</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder="Les Pétanqueurs"
                                data-testid="input-team-name"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="teamDisplayId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Team ID (Optional)</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                value={field.value || ""}
                                placeholder="T001"
                                data-testid="input-team-id"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="division"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Starting Division (Optional)</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                value={field.value || ""}
                                placeholder="A"
                                maxLength={1}
                                className="uppercase"
                                data-testid="input-division"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="homePiste"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Home Piste (Optional)</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                value={field.value || ""}
                                placeholder="Terrain Municipal"
                                data-testid="input-home-piste"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="otherPlayers"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Other Players (Optional)</FormLabel>
                            <FormControl>
                              <Textarea
                                value={field.value ? field.value.join("\n") : ""}
                                onChange={(e) => {
                                  const lines = e.target.value.split("\n").filter(line => line.trim());
                                  field.onChange(lines);
                                }}
                                onBlur={field.onBlur}
                                name={field.name}
                                placeholder="Enter player names (one per line)&#10;Marie Dubois&#10;Pierre Martin"
                                rows={4}
                                data-testid="input-other-players"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="space-y-4 pt-2">
                        <h3 className="text-sm font-semibold text-foreground">
                          Captain Contact Details
                        </h3>
                        <FormField
                          control={form.control}
                          name="captainName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Captain Name</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="Jean Dupont"
                                  data-testid="input-captain-name"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="captainPhone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Phone Number</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="+33 6 12 34 56 78"
                                  data-testid="input-captain-phone"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="captainEmail"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Email Address (Optional)</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  value={field.value || ""}
                                  type="email"
                                  placeholder="captain@example.com"
                                  data-testid="input-captain-email"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                    </div>

                    <div className="flex gap-2 pt-4 flex-shrink-0">
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
                        data-testid="button-submit-team"
                      >
                        {createMutation.isPending ? "Saving..." : "Register Team"}
                      </Button>
                    </div>
                  </form>
                </Form>
                      </DialogContent>
                    </Dialog>
                  </>
                )}
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyShareLink}
              disabled={isSharingLink}
              data-testid="button-share-view"
            >
              <Share2 className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{isSharingLink ? "Creating link..." : "Share View"}</span>
            </Button>
            <Link href="/leaderboard">
              <Button
                variant="outline"
                size="sm"
                data-testid="button-view-leaderboard"
              >
                <Trophy className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Leaderboard</span>
              </Button>
            </Link>
            <HelpDialog title="Teams - Help">
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">What is this page?</h3>
                  <p>{isReadOnly 
                    ? "The Teams page displays all teams registered for the tournament, including their captain contact information and division assignments."
                    : "The Teams page lets you manage all teams registered for the tournament, including their captain contact information and division assignments."
                  }</p>
                </div>
                
                {!isReadOnly && (
                  <>
                    <div>
                      <h3 className="font-semibold mb-2">Adding Teams</h3>
                      <ul className="list-disc pl-5 space-y-1">
                        <li><strong>Add Team:</strong> Click to register a new team one at a time</li>
                        <li><strong>Import Excel:</strong> Upload an Excel file to add multiple teams at once</li>
                      </ul>
                    </div>
                    
                    <div>
                      <h3 className="font-semibold mb-2">Editing Teams</h3>
                      <ul className="list-disc pl-5 space-y-1">
                        <li><strong>Edit All:</strong> Enable bulk editing mode to update multiple teams at once</li>
                        <li><strong>Inline Edit:</strong> Click on any field in the table to edit that team directly</li>
                        <li><strong>Division Changes:</strong> You can only change a team's division if they haven't played any matches yet</li>
                      </ul>
                    </div>
                  </>
                )}
                
                <div>
                  <h3 className="font-semibold mb-2">Contacting Captains</h3>
                  <ul className="list-disc pl-5 space-y-1">
                    <li><strong>Email:</strong> Click the envelope icon next to a captain's email to send them an email</li>
                    <li><strong>WhatsApp:</strong> Click the WhatsApp icon next to a phone number to message the captain directly</li>
                  </ul>
                </div>
                
                <div>
                  <h3 className="font-semibold mb-2">Sharing & Navigation</h3>
                  <ul className="list-disc pl-5 space-y-1">
                    <li><strong>Share View:</strong> Get a short link to share this teams page with others</li>
                    <li><strong>Leaderboard:</strong> Navigate to view team rankings and match results</li>
                  </ul>
                </div>
                
                {!isReadOnly && (
                  <div>
                    <h3 className="font-semibold mb-2">Other Actions</h3>
                    <ul className="list-disc pl-5 space-y-1">
                      <li><strong>Download:</strong> Generate PDF or Excel report of all registered teams</li>
                      <li><strong>Clear All Data:</strong> Delete all teams from the tournament (warning: this cannot be undone)</li>
                      <li><strong>Delete Team:</strong> Click the trash icon next to a team to remove them</li>
                    </ul>
                  </div>
                )}
                
                <div>
                  <h3 className="font-semibold mb-2">Sorting & Filtering</h3>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Click on column headers to sort teams by that field</li>
                    <li>Use the Division filter to view teams from a specific division</li>
                  </ul>
                </div>
              </div>
            </HelpDialog>
          </div>
        </div>

        {teams && teams.length > 0 && (
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">Division:</span>
              <Select value={divisionFilter} onValueChange={setDivisionFilter}>
                <SelectTrigger className="w-[180px]" data-testid="select-division-filter">
                  <SelectValue placeholder="All Divisions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" data-testid="option-all-divisions">All Divisions</SelectItem>
                  {availableDivisions.map(division => (
                    <SelectItem 
                      key={division} 
                      value={division}
                      data-testid={`option-division-${division.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      {division !== 'No Division' ? `Division ${division}` : 'No Division'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {!teams || teams.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="rounded-full bg-muted p-6 mb-4">
                <Users className="h-12 w-12 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                No teams registered yet
              </h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
                {isReadOnly 
                  ? "No teams have been registered for this tournament yet" 
                  : "Get started by registering your first team for the tournament"
                }
              </p>
              {!isReadOnly && (
                <Button onClick={() => setIsCreateOpen(true)} data-testid="button-register-first-team">
                  <Plus className="h-4 w-4 mr-2" />
                  Register Your First Team
                </Button>
              )}
            </CardContent>
          </Card>
        ) : filteredGroupedByDivision.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="rounded-full bg-muted p-6 mb-4">
                <Users className="h-12 w-12 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                No teams in this division
              </h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
                No teams found for the selected division filter
              </p>
              <Button
                variant="outline"
                onClick={() => setDivisionFilter("all")}
                data-testid="button-show-all-divisions"
              >
                Show All Divisions
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {filteredGroupedByDivision.map(([division, divisionTeams]) => (
              <Card key={division}>
                <CardHeader>
                  <CardTitle className="text-xl flex items-center gap-2">
                    {division !== 'No Division' && (
                      <Badge variant="default" className="text-lg px-3 py-1">
                        Division {division}
                      </Badge>
                    )}
                    {division === 'No Division' && (
                      <span>No Division Assigned</span>
                    )}
                    <span className="text-muted-foreground text-base font-normal">
                      ({divisionTeams.length} {divisionTeams.length === 1 ? 'team' : 'teams'})
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
              <div className="overflow-x-auto">
                <div className="rounded-md border">
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
                    <TableHead className="w-[80px]">
                      <button
                        className="flex items-center hover-elevate active-elevate-2 font-medium -ml-3 px-3 py-1 rounded"
                        onClick={() => handleSort("teamDisplayId")}
                        data-testid="sort-team-id"
                      >
                        ID
                        <SortIcon column="teamDisplayId" />
                      </button>
                    </TableHead>
                    <TableHead className="w-[200px]">
                      <button
                        className="flex items-center hover-elevate active-elevate-2 font-medium -ml-3 px-3 py-1 rounded"
                        onClick={() => handleSort("name")}
                        data-testid="sort-name"
                      >
                        Team Name
                        <SortIcon column="name" />
                      </button>
                    </TableHead>
                    <TableHead className="w-[180px]">
                      <button
                        className="flex items-center hover-elevate active-elevate-2 font-medium -ml-3 px-3 py-1 rounded"
                        onClick={() => handleSort("homePiste")}
                        data-testid="sort-home-piste"
                      >
                        Home Piste
                        <SortIcon column="homePiste" />
                      </button>
                    </TableHead>
                    <TableHead className="w-[180px]">
                      <button
                        className="flex items-center hover-elevate active-elevate-2 font-medium -ml-3 px-3 py-1 rounded"
                        onClick={() => handleSort("captainName")}
                        data-testid="sort-captain-name"
                      >
                        Captain Name
                        <SortIcon column="captainName" />
                      </button>
                    </TableHead>
                    <TableHead className="w-[150px]">
                      <button
                        className="flex items-center hover-elevate active-elevate-2 font-medium -ml-3 px-3 py-1 rounded"
                        onClick={() => handleSort("captainPhone")}
                        data-testid="sort-phone"
                      >
                        Phone
                        <SortIcon column="captainPhone" />
                      </button>
                    </TableHead>
                    <TableHead className="w-[200px]">
                      <button
                        className="flex items-center hover-elevate active-elevate-2 font-medium -ml-3 px-3 py-1 rounded"
                        onClick={() => handleSort("captainEmail")}
                        data-testid="sort-email"
                      >
                        Email
                        <SortIcon column="captainEmail" />
                      </button>
                    </TableHead>
                    <TableHead className="w-[200px]">
                      <button
                        className="flex items-center hover-elevate active-elevate-2 font-medium -ml-3 px-3 py-1 rounded"
                        onClick={() => handleSort("otherPlayers")}
                        data-testid="sort-other-players"
                      >
                        Other Players
                        <SortIcon column="otherPlayers" />
                      </button>
                    </TableHead>
                    {!isReadOnly && (
                      <TableHead className="w-[120px] text-right">Actions</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {divisionTeams.map((team) => {
                    const isEditing = editingRowId === team.id;
                    const isEditingInBulk = isEditAllMode && allEditingValues[team.id];
                    const shouldShowInputs = isEditing || isEditingInBulk;
                    const currentValues = isEditingInBulk ? allEditingValues[team.id] : editingValues;
                    const updateValue = isEditingInBulk 
                      ? (field: keyof EditingTeam, value: string | string[]) => updateAllEditingValue(team.id, field, value)
                      : updateEditingValue;
                    
                    return (
                      <TableRow key={team.id} data-testid={`row-team-${team.id}`}>
                        <TableCell>
                          {shouldShowInputs ? (
                            <Input
                              value={currentValues.division || ""}
                              onChange={(e) => updateValue("division", e.target.value)}
                              maxLength={1}
                              className="h-8 w-16 uppercase"
                              data-testid={`input-edit-division-${team.id}`}
                            />
                          ) : (
                            team.division ? (
                              <Badge variant="outline" data-testid={`badge-division-${team.id}`}>
                                {team.division}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )
                          )}
                        </TableCell>
                        <TableCell>
                          {shouldShowInputs ? (
                            <Input
                              value={currentValues.teamDisplayId || ""}
                              onChange={(e) => updateValue("teamDisplayId", e.target.value)}
                              className="h-8 w-20"
                              data-testid={`input-edit-team-id-${team.id}`}
                            />
                          ) : (
                            team.teamDisplayId ? (
                              <span className="font-mono text-sm" data-testid={`text-team-id-${team.id}`}>{team.teamDisplayId}</span>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )
                          )}
                        </TableCell>
                        <TableCell>
                          {shouldShowInputs ? (
                            <Input
                              value={currentValues.name || ""}
                              onChange={(e) => updateValue("name", e.target.value)}
                              className="h-8"
                              data-testid={`input-edit-name-${team.id}`}
                            />
                          ) : (
                            <span data-testid={`text-team-name-${team.id}`}>{team.name}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {shouldShowInputs ? (
                            <Input
                              value={currentValues.homePiste || ""}
                              onChange={(e) => updateValue("homePiste", e.target.value)}
                              className="h-8"
                              data-testid={`input-edit-home-piste-${team.id}`}
                            />
                          ) : (
                            team.homePiste ? (
                              <span data-testid={`text-home-piste-${team.id}`}>{team.homePiste}</span>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )
                          )}
                        </TableCell>
                        <TableCell>
                          {shouldShowInputs ? (
                            <Input
                              value={currentValues.captainName || ""}
                              onChange={(e) => updateValue("captainName", e.target.value)}
                              className="h-8"
                              data-testid={`input-edit-captain-name-${team.id}`}
                            />
                          ) : (
                            <span data-testid={`text-captain-name-${team.id}`}>{team.captainName}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {shouldShowInputs ? (
                            <Input
                              value={currentValues.captainPhone || ""}
                              onChange={(e) => updateValue("captainPhone", e.target.value)}
                              className="h-8"
                              data-testid={`input-edit-captain-phone-${team.id}`}
                            />
                          ) : team.captainPhone ? (
                            <a
                              href={getWhatsAppUrl(team.captainPhone)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 text-foreground hover:text-green-600 transition-colors"
                              data-testid={`link-whatsapp-${team.id}`}
                            >
                              <MessageCircle className="h-4 w-4 text-green-600" />
                              <span data-testid={`text-captain-phone-${team.id}`}>{team.captainPhone}</span>
                            </a>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {shouldShowInputs ? (
                            <Input
                              value={currentValues.captainEmail || ""}
                              onChange={(e) => updateValue("captainEmail", e.target.value)}
                              type="email"
                              className="h-8"
                              data-testid={`input-edit-captain-email-${team.id}`}
                            />
                          ) : team.captainEmail ? (
                            <a
                              href={getMailtoUrl(team.captainEmail, currentTournament?.name || "Tournament")}
                              className="flex items-center gap-1.5 text-foreground hover:text-primary transition-colors"
                              data-testid={`link-email-${team.id}`}
                            >
                              <Mail className="h-4 w-4 text-muted-foreground" />
                              <span data-testid={`text-captain-email-${team.id}`}>{team.captainEmail}</span>
                            </a>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {shouldShowInputs ? (
                            <Textarea
                              value={currentValues.otherPlayers ? currentValues.otherPlayers.join("\n") : ""}
                              onChange={(e) => {
                                const lines = e.target.value.split("\n").filter(line => line.trim());
                                updateValue("otherPlayers", lines as any);
                              }}
                              className="min-h-[60px] text-sm"
                              placeholder="One per line"
                              data-testid={`input-edit-other-players-${team.id}`}
                            />
                          ) : (
                            team.otherPlayers && team.otherPlayers.length > 0 ? (
                              <div className="text-sm" data-testid={`text-other-players-${team.id}`}>
                                {team.otherPlayers.join(", ")}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )
                          )}
                        </TableCell>
                        {!isReadOnly && !isEditAllMode && (
                          <TableCell className="text-right">
                            {isEditing ? (
                              <div className="flex gap-1 justify-end">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => saveEditing(team.id)}
                                  disabled={updateMutation.isPending}
                                  data-testid={`button-save-${team.id}`}
                                >
                                  <Check className="h-4 w-4 text-green-600" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={cancelEditing}
                                  disabled={updateMutation.isPending}
                                  data-testid={`button-cancel-edit-${team.id}`}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex gap-1 justify-end">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => startEditing(team)}
                                  data-testid={`button-edit-${team.id}`}
                                >
                                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                  </svg>
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => handleDeleteClick(team)}
                                  data-testid={`button-delete-${team.id}`}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        )}
                        {isEditAllMode && (
                          <TableCell className="text-right">
                            <span className="text-muted-foreground text-sm">—</span>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                  {isEditAllMode && Object.entries(allEditingValues).filter(([id, _]) => id.startsWith('new-')).map(([id, teamData]) => (
                    <TableRow key={id} data-testid={`row-team-${id}`} className="bg-muted/30">
                      <TableCell>
                        <Input
                          value={teamData.division || ""}
                          onChange={(e) => updateAllEditingValue(id, "division", e.target.value)}
                          maxLength={1}
                          className="h-8 w-16 uppercase"
                          data-testid={`input-edit-division-${id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={teamData.teamDisplayId || ""}
                          onChange={(e) => updateAllEditingValue(id, "teamDisplayId", e.target.value)}
                          className="h-8 w-20"
                          data-testid={`input-edit-team-id-${id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={teamData.name || ""}
                          onChange={(e) => updateAllEditingValue(id, "name", e.target.value)}
                          className="h-8"
                          placeholder="New team name"
                          data-testid={`input-edit-name-${id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={teamData.homePiste || ""}
                          onChange={(e) => updateAllEditingValue(id, "homePiste", e.target.value)}
                          className="h-8"
                          data-testid={`input-edit-home-piste-${id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={teamData.captainName || ""}
                          onChange={(e) => updateAllEditingValue(id, "captainName", e.target.value)}
                          className="h-8"
                          data-testid={`input-edit-captain-name-${id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={teamData.captainPhone || ""}
                          onChange={(e) => updateAllEditingValue(id, "captainPhone", e.target.value)}
                          className="h-8"
                          data-testid={`input-edit-captain-phone-${id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={teamData.captainEmail || ""}
                          onChange={(e) => updateAllEditingValue(id, "captainEmail", e.target.value)}
                          type="email"
                          className="h-8"
                          data-testid={`input-edit-captain-email-${id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Textarea
                          value={teamData.otherPlayers ? teamData.otherPlayers.join("\n") : ""}
                          onChange={(e) => {
                            const lines = e.target.value.split("\n").filter(line => line.trim());
                            updateAllEditingValue(id, "otherPlayers", lines as any);
                          }}
                          className="min-h-[60px] text-sm"
                          placeholder="One per line"
                          data-testid={`input-edit-other-players-${id}`}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeNewTeam(id)}
                          data-testid={`button-remove-${id}`}
                        >
                          <X className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {isEditAllMode && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={addNewTeam}
                          data-testid="button-add-new-team"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add New Team
                        </Button>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
              </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <AlertDialog open={!!deletingTeam} onOpenChange={(open) => {
          if (!open) {
            setDeletingTeam(null);
            setDeletionImpact(null);
          }
        }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Team</AlertDialogTitle>
              <AlertDialogDescription>
                {deletionImpact ? (
                  <>
                    Are you sure you want to delete{" "}
                    <span className="font-semibold">{deletingTeam?.name}</span>?
                    <div className="mt-3 space-y-1.5 text-sm">
                      <p className="font-medium">This action cannot be undone and will also delete:</p>
                      <ul className="list-disc list-inside space-y-0.5 ml-2">
                        <li>
                          <span className="font-semibold">{deletionImpact.matchCount}</span> match
                          {deletionImpact.matchCount !== 1 ? "es" : ""} (where this team plays)
                        </li>
                        <li>
                          <span className="font-semibold">{deletionImpact.resultCount}</span> result record
                          {deletionImpact.resultCount !== 1 ? "s" : ""} (for both teams in those matches)
                        </li>
                      </ul>
                    </div>
                  </>
                ) : (
                  <>
                    Are you sure you want to delete{" "}
                    <span className="font-semibold">{deletingTeam?.name}</span>? This
                    action cannot be undone and will also delete all matches and results
                    associated with this team.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deletingTeam && deleteMutation.mutate(deletingTeam.id)}
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
              <AlertDialogTitle>Clear All Teams</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete all teams? This action cannot be undone and will remove all teams, matches, and results.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-clear-teams">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleClearAllTeams}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-clear-teams"
              >
                Clear All Teams
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={showPdfViewer} onOpenChange={(open) => !open && closePdfViewer()}>
          <DialogContent className="max-w-4xl h-[90vh]" aria-describedby="pdf-viewer-description">
            <DialogHeader>
              <DialogTitle>Teams Report Preview</DialogTitle>
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      data-testid="button-save-dropdown"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={handlePdfSave} data-testid="menu-item-save-pdf">
                      <FileDown className="h-4 w-4 mr-2" />
                      PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExcelSave} data-testid="menu-item-save-excel">
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Excel
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
