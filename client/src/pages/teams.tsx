import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTournament } from "@/contexts/TournamentContext";
import { useViewMode } from "@/contexts/ViewModeContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { Plus, Trash2, Users, Upload, Check, X, ArrowUpDown, ArrowUp, ArrowDown, FileDown, Download, Printer, Share2, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
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

type SortColumn = "name" | "division" | "captainName" | "captainPhone" | "captainEmail" | "homePiste" | "otherPlayers";
type SortDirection = "asc" | "desc";

export default function Teams() {
  const { currentTournament } = useTournament();
  const { isReadOnly, getShareableLink } = useViewMode();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingValues, setEditingValues] = useState<Partial<InsertTeam>>({});
  const [deletingTeam, setDeletingTeam] = useState<Team | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentTournamentRef = useRef<string | null>(null);
  const { toast } = useToast();
  
  // Keep ref in sync with currentTournament to avoid stale closures
  useEffect(() => {
    currentTournamentRef.current = currentTournament?.id || null;
  }, [currentTournament]);

  const { data: teams, isLoading } = useQuery<Team[]>({
    queryKey: ["/api/teams", currentTournament?.id],
    queryFn: async () => {
      if (!currentTournament) return [];
      const response = await fetch(`/api/teams?tournamentId=${currentTournament.id}`);
      if (!response.ok) throw new Error("Failed to fetch teams");
      return response.json();
    },
    enabled: !!currentTournament,
  });

  const form = useForm<InsertTeam>({
    resolver: zodResolver(insertTeamSchema),
    defaultValues: {
      tournamentId: "",
      name: "",
      captainName: "",
      captainPhone: "",
      captainEmail: "",
      division: "",
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
        name: "",
        captainName: "",
        captainPhone: "",
        captainEmail: "",
        division: "",
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

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/teams/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      setDeletingTeam(null);
      toast({
        title: "Team deleted",
        description: "The team has been removed from the league.",
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

  const capitalizeWords = (text: string): string => {
    return text
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
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
            const nameKey = Object.keys(row).find(k => k.toLowerCase() === 'name');
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
              k.toLowerCase() === 'captain_phone'
            );
            return key ? row[key] : null;
          };
          
          const getCaptainEmail = () => {
            const key = Object.keys(row).find(k => 
              k.toLowerCase() === 'captainemail' || 
              k.toLowerCase() === 'captain email' ||
              k.toLowerCase() === 'captain_email'
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
              k.toLowerCase() === 'home_piste'
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

          const name = getName();
          const captainName = getCaptainName();
          const captainPhone = getCaptainPhone();
          const captainEmail = getCaptainEmail();
          const division = getDivision();
          const homePiste = getHomePiste();
          const otherPlayers = getOtherPlayers();

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
          if (!captainEmail || String(captainEmail).trim() === "") missingFields.push("captainEmail");
          
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
              name: capitalizeWords(String(name).trim()),
              captainName: capitalizeWords(String(captainName).trim()),
              captainPhone: String(captainPhone).trim(),
              captainEmail: String(captainEmail).trim(),
              division: division && String(division).trim() !== "" 
                ? String(division).trim().toUpperCase() 
                : null,
              homePiste: homePiste && String(homePiste).trim() !== "" 
                ? String(homePiste).trim() 
                : null,
              otherPlayers: otherPlayers && String(otherPlayers).trim() !== ""
                ? String(otherPlayers).split(/[,\n]/).map(p => capitalizeWords(p.trim())).filter(p => p)
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
    
    const capitalizedData: InsertTeam = {
      tournamentId: currentTournament.id,
      name: capitalizeWords(data.name.trim()),
      captainName: capitalizeWords(data.captainName.trim()),
      captainPhone: data.captainPhone.trim(),
      captainEmail: data.captainEmail.trim(),
      division: data.division?.trim().toUpperCase() || null,
      homePiste: data.homePiste?.trim() || null,
      otherPlayers: data.otherPlayers && data.otherPlayers.length > 0 
        ? data.otherPlayers.map(p => capitalizeWords(p.trim())).filter(p => p)
        : null,
    };
    
    createMutation.mutate(capitalizedData);
  };

  const startEditing = (team: Team) => {
    setEditingRowId(team.id);
    setEditingValues({
      name: team.name,
      captainName: team.captainName,
      captainPhone: team.captainPhone,
      captainEmail: team.captainEmail,
      division: team.division || "",
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
    
    const capitalizedData: InsertTeam = {
      tournamentId: currentTournament.id,
      name: capitalizeWords(editingValues.name?.trim() || ""),
      captainName: capitalizeWords(editingValues.captainName?.trim() || ""),
      captainPhone: editingValues.captainPhone?.trim() || "",
      captainEmail: editingValues.captainEmail?.trim() || "",
      division: editingValues.division?.trim().toUpperCase() || null,
      homePiste: editingValues.homePiste?.trim() || null,
      otherPlayers: editingValues.otherPlayers && editingValues.otherPlayers.length > 0
        ? editingValues.otherPlayers.map(p => capitalizeWords(p.trim())).filter(p => p)
        : null,
    };
    
    updateMutation.mutate({ id: teamId, data: capitalizedData });
  };

  const updateEditingValue = (field: keyof InsertTeam, value: string | string[]) => {
    setEditingValues(prev => ({ ...prev, [field]: value }));
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
    const doc = new jsPDF({ orientation: 'landscape', compress: true });
    
    doc.setFontSize(18);
    doc.text('Teams Report', 14, 15);
    
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 22);
    
    const sortedTeams = getSortedTeams();
    
    const tableData = sortedTeams.map((team) => [
      team.division || '—',
      team.name,
      team.homePiste || '—',
      team.captainName,
      team.captainPhone,
      team.captainEmail,
      team.otherPlayers && team.otherPlayers.length > 0 ? team.otherPlayers.join(', ') : '—',
    ]);
    
    autoTable(doc, {
      head: [['Div', 'Team Name', 'Home Piste', 'Captain Name', 'Phone', 'Email', 'Other Players']],
      body: tableData,
      startY: 28,
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
        0: { cellWidth: 15, halign: 'center' },
        1: { cellWidth: 40 },
        2: { cellWidth: 35 },
        3: { cellWidth: 35 },
        4: { cellWidth: 30 },
        5: { cellWidth: 45 },
        6: { cellWidth: 50 },
      },
    });
    
    return doc;
  };

  const openPdfViewer = () => {
    const doc = generatePDFDocument();
    
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    if (isMobile) {
      const pdfDataUrl = doc.output('dataurlstring');
      setPdfBlobUrl(pdfDataUrl);
    } else {
      const pdfBlob = doc.output('blob');
      const url = URL.createObjectURL(pdfBlob);
      setPdfBlobUrl(url);
    }
    
    setShowPdfViewer(true);
  };

  const handlePdfSave = () => {
    const doc = generatePDFDocument();
    const pdfBlob = doc.output('blob');
    const url = URL.createObjectURL(pdfBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `teams-report-${new Date().toISOString().split('T')[0]}.pdf`;
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
    const shareLink = getShareableLink(currentTournament?.id);
    try {
      await navigator.clipboard.writeText(shareLink);
      toast({
        title: "Link copied",
        description: "Shareable view-only link has been copied to your clipboard.",
      });
    } catch (error) {
      toast({
        title: "Failed to copy",
        description: "Please copy the link manually from your browser's address bar.",
        variant: "destructive",
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
              data-testid="button-view-pdf"
            >
              <FileDown className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">View PDF</span>
            </Button>
            {!isReadOnly && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowClearConfirm(true)}
                  data-testid="button-clear-all-teams"
                >
                  <Trash2 className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Clear All Data</span>
                </Button>
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" data-testid="button-add-team">
                      <Plus className="h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">Add Team</span>
                    </Button>
                  </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]" aria-describedby="team-form-description">
                <DialogHeader>
                  <DialogTitle>Register New Team</DialogTitle>
                  <p id="team-form-description" className="sr-only">
                    Enter team name and captain contact information to register a new team
                  </p>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                              <FormLabel>Email Address</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
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
                        data-testid="button-submit-team"
                      >
                        {createMutation.isPending ? "Saving..." : "Register Team"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
                </Dialog>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyShareLink}
                  data-testid="button-copy-share-link"
                >
                  <Share2 className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Copy Share Link</span>
                </Button>
              </>
            )}
          </div>
        </div>

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
                  : "Get started by registering your first team for the league competition"
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
        ) : (
          <Card>
              <div className="overflow-x-auto">
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">
                      <button
                        className="flex items-center hover-elevate active-elevate-2 font-medium -ml-3 px-3 py-1 rounded"
                        onClick={() => handleSort("division")}
                        data-testid="sort-division"
                      >
                        Division
                        <SortIcon column="division" />
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
                  {getSortedTeams().map((team) => {
                    const isEditing = editingRowId === team.id;
                    
                    return (
                      <TableRow key={team.id} data-testid={`row-team-${team.id}`}>
                        <TableCell>
                          {isEditing ? (
                            <Input
                              value={editingValues.division || ""}
                              onChange={(e) => updateEditingValue("division", e.target.value)}
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
                          {isEditing ? (
                            <Input
                              value={editingValues.name || ""}
                              onChange={(e) => updateEditingValue("name", e.target.value)}
                              className="h-8"
                              data-testid={`input-edit-name-${team.id}`}
                            />
                          ) : (
                            <span data-testid={`text-team-name-${team.id}`}>{team.name}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Input
                              value={editingValues.homePiste || ""}
                              onChange={(e) => updateEditingValue("homePiste", e.target.value)}
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
                          {isEditing ? (
                            <Input
                              value={editingValues.captainName || ""}
                              onChange={(e) => updateEditingValue("captainName", e.target.value)}
                              className="h-8"
                              data-testid={`input-edit-captain-name-${team.id}`}
                            />
                          ) : (
                            <span data-testid={`text-captain-name-${team.id}`}>{team.captainName}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Input
                              value={editingValues.captainPhone || ""}
                              onChange={(e) => updateEditingValue("captainPhone", e.target.value)}
                              className="h-8"
                              data-testid={`input-edit-captain-phone-${team.id}`}
                            />
                          ) : (
                            <span data-testid={`text-captain-phone-${team.id}`}>{team.captainPhone}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Input
                              value={editingValues.captainEmail || ""}
                              onChange={(e) => updateEditingValue("captainEmail", e.target.value)}
                              type="email"
                              className="h-8"
                              data-testid={`input-edit-captain-email-${team.id}`}
                            />
                          ) : (
                            <span data-testid={`text-captain-email-${team.id}`}>{team.captainEmail}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <Textarea
                              value={editingValues.otherPlayers ? editingValues.otherPlayers.join("\n") : ""}
                              onChange={(e) => {
                                const lines = e.target.value.split("\n").filter(line => line.trim());
                                updateEditingValue("otherPlayers", lines as any);
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
                        {!isReadOnly && (
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
                                  onClick={() => setDeletingTeam(team)}
                                  data-testid={`button-delete-${team.id}`}
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

        <AlertDialog open={!!deletingTeam} onOpenChange={(open) => !open && setDeletingTeam(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Team</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete{" "}
                <span className="font-semibold">{deletingTeam?.name}</span>? This
                action cannot be undone and will remove the team from all matches.
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
