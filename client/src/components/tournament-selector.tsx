import { useState, useRef } from "react";
import { useTournament } from "@/contexts/TournamentContext";
import { useViewMode } from "@/contexts/ViewModeContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTournamentSchema, type InsertTournament, type Tournament } from "@shared/schema";
import { Trophy, Plus, ChevronDown, Trash2, Pencil, UserRoundCheck, Users, X, FileText, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export function TournamentSelector() {
  const { currentTournament, selectTournament, createTournament, updateTournament, deleteTournament, lockedTournamentId } = useTournament();
  const { isReadOnly, isMasterAdmin } = useViewMode();
  const { user } = useAuth();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  const [deletingTournament, setDeletingTournament] = useState<Tournament | null>(null);
  const [transferringTournament, setTransferringTournament] = useState<Tournament | null>(null);
  const [transferEmail, setTransferEmail] = useState("");
  const [sharingTournament, setSharingTournament] = useState<Tournament | null>(null);
  const [collaboratorEmail, setCollaboratorEmail] = useState("");
  const [rulesFile, setRulesFile] = useState<File | null>(null);
  const [isUploadingRules, setIsUploadingRules] = useState(false);
  const [pendingEditData, setPendingEditData] = useState<InsertTournament | null>(null);
  const [showRecalcConfirm, setShowRecalcConfirm] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const rulesFileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isTournamentLocked = !!lockedTournamentId;

  const { data: tournaments } = useQuery<Tournament[]>({
    queryKey: ["/api/tournaments"],
  });

  // Query to get counts for tournament deletion warning
  const { data: deletionCounts } = useQuery<{ teams: number; matches: number }>({
    queryKey: ["/api/tournaments", deletingTournament?.id, "deletion-counts"],
    queryFn: async () => {
      if (!deletingTournament) return { teams: 0, matches: 0 };
      
      const [teamsRes, matchesRes] = await Promise.all([
        fetch(`/api/teams?tournamentId=${deletingTournament.id}`),
        fetch(`/api/matches?tournamentId=${deletingTournament.id}`)
      ]);
      
      const teams = await teamsRes.json();
      const matches = await matchesRes.json();
      
      return {
        teams: teams.length,
        matches: matches.length
      };
    },
    enabled: !!deletingTournament,
  });

  // Fetch collaborators when sharing dialog is open
  const { data: collaborators = [], refetch: refetchCollaborators } = useQuery<any[]>({
    queryKey: ["/api/tournaments", sharingTournament?.id, "collaborators"],
    queryFn: async () => {
      if (!sharingTournament) return [];
      const res = await apiRequest("GET", `/api/tournaments/${sharingTournament.id}/collaborators`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!sharingTournament,
  });

  const { mutate: doAddCollaborator, isPending: isAddingCollaborator } = useMutation<any, Error, { tournamentId: string; email: string }>({
    mutationFn: async ({ tournamentId, email }) => {
      const response = await apiRequest("POST", `/api/tournaments/${tournamentId}/collaborators`, { email });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Failed to add co-editor");
      }
      return response.json();
    },
    onSuccess: () => {
      setCollaboratorEmail("");
      refetchCollaborators();
      toast({ title: "Co-editor added", description: "They can now manage this tournament." });
    },
    onError: (error) => {
      toast({ title: "Failed to add co-editor", description: error.message, variant: "destructive", duration: Infinity });
    },
  });

  const { mutate: doRemoveCollaborator } = useMutation<any, Error, { tournamentId: string; userId: string }>({
    mutationFn: async ({ tournamentId, userId }) => {
      const response = await apiRequest("DELETE", `/api/tournaments/${tournamentId}/collaborators/${userId}`);
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Failed to remove co-editor");
      }
    },
    onSuccess: () => {
      refetchCollaborators();
      toast({ title: "Co-editor removed" });
    },
    onError: (error) => {
      toast({ title: "Failed to remove co-editor", description: error.message, variant: "destructive", duration: Infinity });
    },
  });

  const { mutate: doTransfer, isPending: isTransferring } = useMutation<any, Error, { id: string; email: string }>({
    mutationFn: async ({ id, email }) => {
      const response = await apiRequest("PATCH", `/api/tournaments/${id}/transfer`, { email });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Transfer failed");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments"] });
      const ownerName = data.newOwnerDisplayName || data.newOwnerEmail;
      toast({
        title: "Ownership transferred",
        description: `Tournament is now owned by ${ownerName}.`,
      });
      setTransferringTournament(null);
      setTransferEmail("");
    },
    onError: (error) => {
      toast({
        title: "Transfer failed",
        description: error.message,
        variant: "destructive",
        duration: Infinity,
      });
    },
  });

  const handleTransferOwnership = () => {
    if (!transferringTournament || !transferEmail.trim()) return;
    doTransfer({ id: transferringTournament.id, email: transferEmail.trim() });
  };

  const form = useForm<InsertTournament>({
    resolver: zodResolver(insertTournamentSchema),
    defaultValues: {
      name: "",
      description: "",
      numberOfDivisions: 2,
      gamesPerMatch: 3,
      hasQuarterFinals: false,
      hasSemiFinals: false,
      hasFinals: true,
      pointsForWin: 3,
      pointsForDraw: 2,
      pointsForLoss: 1,
      pointsForNoShow: 0,
      numberOfPistes: null,
    },
  });

  const handleCreateTournament = async (data: InsertTournament) => {
    try {
      await createTournament(data);
      setIsCreateOpen(false);
      form.reset();
      toast({
        title: "Tournament created",
        description: `${data.name} has been created successfully.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create tournament",
        variant: "destructive",
        duration: Infinity,
      });
    }
  };

  const doEditTournament = async (data: InsertTournament, recalculate = false) => {
    if (!editingTournament) return;
    try {
      await updateTournament(editingTournament.id, data);
      if (recalculate) {
        setIsRecalculating(true);
        try {
          const res = await apiRequest("POST", `/api/tournaments/${editingTournament.id}/recalculate-results`);
          const { recalculated } = await res.json();
          toast({
            title: "Tournament updated",
            description: `${data.name} updated. ${recalculated} match result${recalculated !== 1 ? "s" : ""} recalculated with new point values.`,
          });
        } finally {
          setIsRecalculating(false);
        }
      } else {
        toast({
          title: "Tournament updated",
          description: `${data.name} has been updated successfully.`,
        });
      }
      setEditingTournament(null);
      setShowRecalcConfirm(false);
      setPendingEditData(null);
      form.reset();
    } catch (error) {
      setIsRecalculating(false);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update tournament",
        variant: "destructive",
        duration: Infinity,
      });
    }
  };

  const handleEditTournament = async (data: InsertTournament) => {
    if (!editingTournament) return;
    const pointValuesChanged =
      data.pointsForWin !== (editingTournament.pointsForWin ?? 3) ||
      data.pointsForDraw !== (editingTournament.pointsForDraw ?? 2) ||
      data.pointsForLoss !== (editingTournament.pointsForLoss ?? 1) ||
      data.pointsForNoShow !== ((editingTournament as any).pointsForNoShow ?? 0);

    if (pointValuesChanged) {
      setPendingEditData(data);
      setShowRecalcConfirm(true);
      return;
    }
    await doEditTournament(data, false);
  };

  const handleDeleteTournament = async (tournament: Tournament) => {
    try {
      await deleteTournament(tournament.id);
      setDeletingTournament(null);
      toast({
        title: "Tournament deleted",
        description: `${tournament.name} and all associated data have been deleted.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete tournament",
        variant: "destructive",
        duration: Infinity,
      });
    }
  };

  const handleUploadRules = async () => {
    if (!editingTournament || !rulesFile) return;
    setIsUploadingRules(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(rulesFile);
      });
      const response = await apiRequest("POST", `/api/tournaments/${editingTournament.id}/rules`, {
        pdfData: base64,
        pdfName: rulesFile.name,
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Upload failed");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments"] });
      setRulesFile(null);
      // Refresh editingTournament so the filename shows immediately
      setEditingTournament({ ...editingTournament, rulesPdfName: rulesFile.name } as any);
      toast({ title: "Rules uploaded", description: `${rulesFile.name} has been saved.` });
    } catch (error) {
      toast({ title: "Upload failed", description: error instanceof Error ? error.message : "Failed to upload rules", variant: "destructive", duration: Infinity });
    } finally {
      setIsUploadingRules(false);
    }
  };

  const handleRemoveRules = async () => {
    if (!editingTournament) return;
    setIsUploadingRules(true);
    try {
      const response = await apiRequest("DELETE", `/api/tournaments/${editingTournament.id}/rules`);
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Failed to remove rules");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments"] });
      setEditingTournament({ ...editingTournament, rulesPdfName: null, rulesPdfData: null } as any);
      toast({ title: "Rules removed" });
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to remove rules", variant: "destructive", duration: Infinity });
    } finally {
      setIsUploadingRules(false);
    }
  };

  const getTournamentDetails = (tournament: Tournament) => {
    const stages = [];
    if (tournament.hasQuarterFinals) stages.push("QF");
    if (tournament.hasSemiFinals) stages.push("SF");
    if (tournament.hasFinals) stages.push("F");
    return `${tournament.numberOfDivisions} div${tournament.numberOfDivisions !== 1 ? 's' : ''} • ${tournament.gamesPerMatch} game${tournament.gamesPerMatch !== 1 ? 's' : ''} • ${stages.join(', ') || 'No stages'}`;
  };

  if (!currentTournament) {
    // Any logged-in user can create a tournament
    if (!isMasterAdmin && !user) {
      return (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted text-muted-foreground" data-testid="tournament-display-empty">
          <Trophy className="h-4 w-4" />
          <span className="text-sm">No tournament selected</span>
        </div>
      );
    }
    
    return (
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" data-testid="button-create-first-tournament">
            <Plus className="h-4 w-4 mr-2" />
            Create Tournament
          </Button>
        </DialogTrigger>
        <DialogContent data-testid="dialog-create-tournament" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Tournament</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleCreateTournament)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tournament Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Summer Tournament 2024" data-testid="input-tournament-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea {...field} value={field.value || ""} placeholder="Enter tournament description for report headers" data-testid="input-tournament-description" className="resize-none" rows={2} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="numberOfDivisions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Number of Divisions</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        min={1}
                        onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                        data-testid="input-number-of-divisions"
                      />
                    </FormControl>
                    <FormDescription>Teams will be organized into divisions (A, B, C, etc.)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="gamesPerMatch"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Games Per Match</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        min={1}
                        max={5}
                        onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                        data-testid="input-games-per-match"
                      />
                    </FormControl>
                    <FormDescription>Number of games in each match (1-5)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="numberOfPistes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Number of Pistes (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value === "" ? null : parseInt(e.target.value, 10))}
                        placeholder="Leave blank if not applicable"
                        data-testid="input-number-of-pistes"
                      />
                    </FormControl>
                    <FormDescription>When set, a Piste column appears in Matches and Results.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-3">
                <FormLabel>Tournament Stages</FormLabel>
                <FormField
                  control={form.control}
                  name="hasFinals"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-has-finals"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Finals</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="hasSemiFinals"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-has-semi-finals"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Semi-Finals</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="hasQuarterFinals"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-has-quarter-finals"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Quarter-Finals</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-3">
                <FormLabel>Point Values</FormLabel>
                <FormDescription>Points awarded per game result</FormDescription>
                <div className="grid grid-cols-4 gap-3">
                  <FormField
                    control={form.control}
                    name="pointsForWin"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Win</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min={0}
                            onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                            data-testid="input-points-for-win"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="pointsForDraw"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Draw</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min={0}
                            onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                            data-testid="input-points-for-draw"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="pointsForLoss"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Loss</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min={0}
                            onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                            data-testid="input-points-for-loss"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="pointsForNoShow"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">No-Show</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min={0}
                            onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                            data-testid="input-points-for-no-show"
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
                <Button type="submit" className="flex-1" data-testid="button-submit-tournament">
                  Create Tournament
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    );
  }

  // In read-only mode or locked tournament, show tournament name without dropdown
  if (isReadOnly || isTournamentLocked) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-background" data-testid="tournament-display-readonly">
        <Trophy className="h-4 w-4 text-muted-foreground" />
        <div className="flex flex-col items-start">
          <span className="font-medium text-sm">{currentTournament.name}</span>
          <span className="text-xs text-muted-foreground">
            {getTournamentDetails(currentTournament)}
            {isTournamentLocked && " • Locked to access link"}
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-2" data-testid="button-tournament-selector">
            <Trophy className="h-4 w-4" />
            <div className="flex flex-col items-start">
              <span className="font-medium">{currentTournament.name}</span>
              <span className="text-xs text-muted-foreground">{getTournamentDetails(currentTournament)}</span>
            </div>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-80">
          <DropdownMenuLabel>Select Tournament</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {tournaments?.map((tournament) => (
            <DropdownMenuItem
              key={tournament.id}
              onClick={() => selectTournament(tournament)}
              className="flex items-start justify-between gap-2 py-3"
              data-testid={`tournament-option-${tournament.id}`}
            >
              <div className="flex items-start gap-2 flex-1 min-w-0">
                {tournament.id === currentTournament.id && <Trophy className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />}
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-medium truncate">{tournament.name}</span>
                  <span className="text-xs text-muted-foreground">{getTournamentDetails(tournament)}</span>
                </div>
              </div>
              {(isMasterAdmin || (user && (tournament.userId === user.id || (tournament as any).isShared))) && (
                <div className="flex gap-1 flex-shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingTournament(tournament);
                      form.reset({
                        name: tournament.name,
                        description: tournament.description || "",
                        numberOfDivisions: tournament.numberOfDivisions,
                        gamesPerMatch: tournament.gamesPerMatch,
                        hasQuarterFinals: tournament.hasQuarterFinals,
                        hasSemiFinals: tournament.hasSemiFinals,
                        hasFinals: tournament.hasFinals,
                        pointsForWin: tournament.pointsForWin ?? 3,
                        pointsForDraw: tournament.pointsForDraw ?? 2,
                        pointsForLoss: tournament.pointsForLoss ?? 1,
                        pointsForNoShow: (tournament as any).pointsForNoShow ?? 0,
                        numberOfPistes: (tournament as any).numberOfPistes ?? null,
                      });
                    }}
                    data-testid={`button-edit-tournament-${tournament.id}`}
                    title="Edit tournament settings"
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  {/* Share / co-editors — owner and master admin only, not collaborators */}
                  {(isMasterAdmin || (user && tournament.userId === user.id)) && (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCollaboratorEmail("");
                          setSharingTournament(tournament);
                        }}
                        data-testid={`button-share-tournament-${tournament.id}`}
                        title="Share tournament (add co-editors)"
                      >
                        <Users className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTransferEmail("");
                          setTransferringTournament(tournament);
                        }}
                        data-testid={`button-transfer-tournament-${tournament.id}`}
                        title="Transfer ownership"
                      >
                        <UserRoundCheck className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingTournament(tournament);
                        }}
                        data-testid={`button-delete-tournament-${tournament.id}`}
                        title="Delete tournament"
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              )}
            </DropdownMenuItem>
          ))}
          {(isMasterAdmin || user) && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setIsCreateOpen(true)} data-testid="button-create-new-tournament">
                <Plus className="h-4 w-4 mr-2" />
                Create New Tournament
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent data-testid="dialog-create-tournament" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Tournament</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleCreateTournament)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tournament Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Summer Tournament 2024" data-testid="input-tournament-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea {...field} value={field.value || ""} placeholder="Enter tournament description for report headers" data-testid="input-tournament-description" className="resize-none" rows={2} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="numberOfDivisions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Number of Divisions</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        min={1}
                        onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                        data-testid="input-number-of-divisions"
                      />
                    </FormControl>
                    <FormDescription>Teams will be organized into divisions (A, B, C, etc.)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="gamesPerMatch"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Games Per Match</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        min={1}
                        max={5}
                        onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                        data-testid="input-games-per-match"
                      />
                    </FormControl>
                    <FormDescription>Number of games in each match (1-5)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="numberOfPistes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Number of Pistes (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value === "" ? null : parseInt(e.target.value, 10))}
                        placeholder="Leave blank if not applicable"
                        data-testid="input-number-of-pistes"
                      />
                    </FormControl>
                    <FormDescription>When set, a Piste column appears in Matches and Results.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-3">
                <FormLabel>Tournament Stages</FormLabel>
                <FormField
                  control={form.control}
                  name="hasFinals"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-has-finals"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Finals</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="hasSemiFinals"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-has-semi-finals"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Semi-Finals</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="hasQuarterFinals"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-has-quarter-finals"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Quarter-Finals</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
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
                <Button type="submit" className="flex-1" data-testid="button-submit-tournament">
                  Create Tournament
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingTournament} onOpenChange={(open) => !open && setEditingTournament(null)}>
        <DialogContent data-testid="dialog-edit-tournament" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Tournament</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleEditTournament)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tournament Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Summer Tournament 2024" data-testid="input-edit-tournament-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea {...field} value={field.value || ""} placeholder="Enter tournament description for report headers" data-testid="input-edit-tournament-description" className="resize-none" rows={2} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="numberOfDivisions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Number of Divisions</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        min={1}
                        onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                        data-testid="input-edit-number-of-divisions"
                      />
                    </FormControl>
                    <FormDescription>Teams will be organized into divisions (A, B, C, etc.)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="gamesPerMatch"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Games Per Match</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        min={1}
                        max={5}
                        onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                        data-testid="input-edit-games-per-match"
                      />
                    </FormControl>
                    <FormDescription>Number of games in each match (1-5)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="numberOfPistes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Number of Pistes (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value === "" ? null : parseInt(e.target.value, 10))}
                        placeholder="Leave blank if not applicable"
                        data-testid="input-edit-number-of-pistes"
                      />
                    </FormControl>
                    <FormDescription>When set, a Piste column appears in Matches and Results.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-3">
                <FormLabel>Tournament Stages</FormLabel>
                <FormField
                  control={form.control}
                  name="hasFinals"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-edit-has-finals"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Finals</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="hasSemiFinals"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-edit-has-semi-finals"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Semi-Finals</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="hasQuarterFinals"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-edit-has-quarter-finals"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Quarter-Finals</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-3">
                <FormLabel>Point Values</FormLabel>
                <FormDescription>Points awarded per game result</FormDescription>
                <div className="grid grid-cols-4 gap-3">
                  <FormField
                    control={form.control}
                    name="pointsForWin"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Win</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min={0}
                            onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                            data-testid="input-edit-points-for-win"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="pointsForDraw"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Draw</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min={0}
                            onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                            data-testid="input-edit-points-for-draw"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="pointsForLoss"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Loss</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min={0}
                            onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                            data-testid="input-edit-points-for-loss"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="pointsForNoShow"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">No-Show</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min={0}
                            onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                            data-testid="input-edit-points-for-no-show"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Rules PDF */}
              <div className="space-y-2">
                <FormLabel>Tournament Rules (PDF)</FormLabel>
                {(editingTournament as any)?.rulesPdfName && !rulesFile && (
                  <div className="flex items-center gap-2 p-2 rounded-md border bg-muted text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="flex-1 truncate">{(editingTournament as any).rulesPdfName}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-destructive hover:text-destructive"
                      onClick={handleRemoveRules}
                      disabled={isUploadingRules}
                    >
                      Remove
                    </Button>
                  </div>
                )}
                {rulesFile && (
                  <div className="flex items-center gap-2 p-2 rounded-md border bg-muted text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="flex-1 truncate">{rulesFile.name}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-destructive hover:text-destructive"
                      onClick={() => setRulesFile(null)}
                    >
                      Clear
                    </Button>
                  </div>
                )}
                <div className="flex gap-2 items-center">
                  <input
                    type="file"
                    accept="application/pdf"
                    ref={rulesFileInputRef}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setRulesFile(file);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => rulesFileInputRef.current?.click()}
                    disabled={isUploadingRules}
                  >
                    Browse…
                  </Button>
                  {rulesFile && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleUploadRules}
                      disabled={isUploadingRules}
                    >
                      <Upload className="h-3 w-3 mr-1" />
                      {isUploadingRules ? "Uploading…" : "Upload PDF"}
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Upload a PDF containing the tournament rules (max ~7 MB).</p>
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingTournament(null);
                    setRulesFile(null);
                    form.reset();
                  }}
                  className="flex-1"
                  data-testid="button-cancel-edit"
                >
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" data-testid="button-submit-edit-tournament">
                  Update Tournament
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingTournament} onOpenChange={(open) => !open && setDeletingTournament(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tournament</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Are you sure you want to delete <span className="font-semibold">"{deletingTournament?.name}"</span>?
                </p>
                
                {deletionCounts ? (
                  <div className="rounded-md bg-muted p-3 space-y-1 text-sm">
                    <p className="font-medium text-foreground">This will permanently delete:</p>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      <li>{deletionCounts.teams} {deletionCounts.teams === 1 ? 'team' : 'teams'}</li>
                      <li>{deletionCounts.matches} {deletionCounts.matches === 1 ? 'match' : 'matches'}</li>
                      <li>All results and tournament data</li>
                    </ul>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Loading tournament data...</p>
                )}
                
                <p className="text-destructive font-medium">
                  This action cannot be undone.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingTournament && handleDeleteTournament(deletingTournament)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
              disabled={!deletionCounts}
            >
              Delete Tournament
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showRecalcConfirm} onOpenChange={(open) => {
        if (!open) { setShowRecalcConfirm(false); setPendingEditData(null); }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recalculate Results?</AlertDialogTitle>
            <AlertDialogDescription>
              You have changed one or more point values. All existing completed match results for this tournament will be recalculated using the new values. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRecalculating} onClick={() => { setShowRecalcConfirm(false); setPendingEditData(null); }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isRecalculating}
              onClick={async () => { if (pendingEditData) await doEditTournament(pendingEditData, true); }}
            >
              {isRecalculating ? "Recalculating…" : "Update & Recalculate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!transferringTournament} onOpenChange={(open) => {
        if (!open) {
          setTransferringTournament(null);
          setTransferEmail("");
        }
      }}>
        <DialogContent data-testid="dialog-transfer-tournament">
          <DialogHeader>
            <DialogTitle>Transfer Ownership — {transferringTournament?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter the email address of the user you want to transfer this tournament to. They must already have an account. The new owner will have full control over this tournament.
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="transfer-email">New Owner's Email</label>
              <Input
                id="transfer-email"
                type="email"
                placeholder="user@example.com"
                value={transferEmail}
                onChange={(e) => setTransferEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleTransferOwnership()}
                data-testid="input-transfer-email"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              <strong>Note:</strong> This action immediately reassigns tournament ownership. The new owner can manage and delete this tournament. You will lose ownership but can still access it via your admin link.
            </p>
            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setTransferringTournament(null);
                  setTransferEmail("");
                }}
                className="flex-1"
                data-testid="button-cancel-transfer"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleTransferOwnership}
                disabled={!transferEmail.trim() || isTransferring}
                className="flex-1"
                data-testid="button-confirm-transfer"
              >
                {isTransferring ? "Transferring..." : "Transfer Ownership"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share Tournament / Co-editors dialog */}
      <Dialog open={!!sharingTournament} onOpenChange={(open) => {
        if (!open) { setSharingTournament(null); setCollaboratorEmail(""); }
      }}>
        <DialogContent data-testid="dialog-share-tournament">
          <DialogHeader>
            <DialogTitle>Co-editors — {sharingTournament?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Co-editors can add teams, manage matches, and update results. They cannot delete the tournament or manage co-editors.
            </p>

            {/* Add co-editor */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Add co-editor by email</label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="user@example.com"
                  value={collaboratorEmail}
                  onChange={(e) => setCollaboratorEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && sharingTournament && collaboratorEmail.trim()) {
                      doAddCollaborator({ tournamentId: sharingTournament.id, email: collaboratorEmail.trim() });
                    }
                  }}
                  data-testid="input-collaborator-email"
                />
                <Button
                  type="button"
                  disabled={!collaboratorEmail.trim() || isAddingCollaborator}
                  onClick={() => sharingTournament && doAddCollaborator({ tournamentId: sharingTournament.id, email: collaboratorEmail.trim() })}
                  data-testid="button-add-collaborator"
                >
                  {isAddingCollaborator ? "Adding…" : "Add"}
                </Button>
              </div>
            </div>

            {/* Current co-editors list */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Current co-editors</label>
              {collaborators.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No co-editors yet.</p>
              ) : (
                <ul className="space-y-1">
                  {collaborators.map((c: any) => (
                    <li key={c.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                      <div>
                        <span className="font-medium">{c.displayName || c.email}</span>
                        {c.displayName && <span className="ml-2 text-muted-foreground text-xs">{c.email}</span>}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => sharingTournament && doRemoveCollaborator({ tournamentId: sharingTournament.id, userId: c.id })}
                        title="Remove co-editor"
                      >
                        <X className="h-3 w-3 text-destructive" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setSharingTournament(null)} className="flex-1">Close</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </>
  );
}
