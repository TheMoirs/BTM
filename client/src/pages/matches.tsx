import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
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
import { Plus, Trash2, Shuffle, Check, X, ArrowUpDown, ArrowUp, ArrowDown, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
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

type SortColumn = "team1" | "team2" | "stage" | "status" | "matchDate";
type SortDirection = "asc" | "desc";

type EditingMatch = {
  team1Id: string;
  team2Id: string;
  stage: string;
  status: string;
  matchDate: string;
  team1Score: string;
  team2Score: string;
};

export default function Matches() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingValues, setEditingValues] = useState<Partial<EditingMatch>>({});
  const [deletingMatch, setDeletingMatch] = useState<Match | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>("matchDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const { toast } = useToast();

  const { data: teams } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const { data: matches, isLoading } = useQuery<Match[]>({
    queryKey: ["/api/matches"],
  });

  const form = useForm<InsertMatch>({
    resolver: zodResolver(insertMatchSchema),
    defaultValues: {
      team1Id: "",
      team2Id: "",
      stage: "initial",
      status: "scheduled",
      matchDate: null,
      team1Score: null,
      team2Score: null,
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertMatch) => apiRequest("POST", "/api/matches", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
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
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiRequest("PATCH", `/api/matches/${id}/score`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
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
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/matches/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
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
      });
    },
  });

  const handleGenerateMatches = async () => {
    if (!teams || teams.length < 2) {
      toast({
        title: "Not enough teams",
        description: "You need at least 2 teams to generate matches.",
        variant: "destructive",
      });
      return;
    }

    try {
      let successCount = 0;
      const numMatches = Math.floor(teams.length / 2);

      for (let i = 0; i < numMatches; i++) {
        const team1Index = (i * 2) % teams.length;
        const team2Index = (i * 2 + 1) % teams.length;

        const matchData: InsertMatch = {
          team1Id: teams[team1Index].id,
          team2Id: teams[team2Index].id,
          stage: "initial",
          status: "scheduled",
          matchDate: null,
          team1Score: null,
          team2Score: null,
          winnerId: null,
        };

        await apiRequest("POST", "/api/matches", matchData);
        successCount++;
      }

      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });

      toast({
        title: "Matches generated",
        description: `Successfully created ${successCount} match(es).`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate matches.",
        variant: "destructive",
      });
    }
  };

  const handleClearAllMatches = async () => {
    if (!matches) {
      setShowClearConfirm(false);
      return;
    }

    let deletedCount = 0;
    for (const match of matches) {
      try {
        await apiRequest("DELETE", `/api/matches/${match.id}`);
        deletedCount++;
      } catch (error) {
        console.error(`Failed to delete match ${match.id}`, error);
      }
    }

    queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
    setShowClearConfirm(false);

    toast({
      title: "All matches cleared",
      description: `Deleted ${deletedCount} match(es) from the system.`,
    });
  };

  const onSubmit = (data: InsertMatch) => {
    if (data.team1Id === data.team2Id) {
      toast({
        title: "Invalid selection",
        description: "Please select two different teams",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate(data);
  };

  const startEditing = (match: Match) => {
    setEditingRowId(match.id);
    setEditingValues({
      team1Id: match.team1Id,
      team2Id: match.team2Id,
      stage: match.stage,
      status: match.status,
      matchDate: match.matchDate || "",
      team1Score: match.team1Score?.toString() || "",
      team2Score: match.team2Score?.toString() || "",
    });
  };

  const cancelEditing = () => {
    setEditingRowId(null);
    setEditingValues({});
  };

  const saveEditing = (matchId: string) => {
    // Parse scores, keeping null for empty values
    const team1Score = editingValues.team1Score?.trim() 
      ? parseInt(editingValues.team1Score) 
      : null;
    const team2Score = editingValues.team2Score?.trim() 
      ? parseInt(editingValues.team2Score) 
      : null;

    // Validate that if one score is provided, both must be provided
    if ((team1Score !== null && team2Score === null) || 
        (team1Score === null && team2Score !== null)) {
      toast({
        title: "Invalid scores",
        description: "Please provide both scores or leave both empty.",
        variant: "destructive",
      });
      return;
    }

    // Validate scores are non-negative integers
    if (team1Score !== null && (isNaN(team1Score) || team1Score < 0)) {
      toast({
        title: "Invalid score",
        description: "Team 1 score must be a non-negative number.",
        variant: "destructive",
      });
      return;
    }

    if (team2Score !== null && (isNaN(team2Score) || team2Score < 0)) {
      toast({
        title: "Invalid score",
        description: "Team 2 score must be a non-negative number.",
        variant: "destructive",
      });
      return;
    }

    updateMutation.mutate({
      id: matchId,
      data: {
        team1Score,
        team2Score,
      },
    });
  };

  const updateEditingValue = (field: keyof EditingMatch, value: string) => {
    setEditingValues(prev => ({ ...prev, [field]: value }));
  };

  const getTeamName = (teamId: string) => {
    const team = teams?.find(t => t.id === teamId);
    return team?.name || "Unknown Team";
  };

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const getSortedMatches = useMemo(() => {
    if (!matches) return [];

    const sorted = [...matches].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortColumn) {
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
  }, [matches, sortColumn, sortDirection, teams]);

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
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Matches</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Schedule matches and record results
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleGenerateMatches}
              data-testid="button-generate-matches"
            >
              <Shuffle className="h-4 w-4 mr-2" />
              Generate Matches
            </Button>
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
                                  {team.name}
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
                                  {team.name}
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
          </div>
        </div>

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
                Create your first match or generate matches automatically from your teams
              </p>
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
            </CardContent>
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
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
                    <TableHead className="w-[120px]">
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
                    <TableHead className="w-[100px] text-center">Score</TableHead>
                    <TableHead className="w-[120px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {getSortedMatches.map((match) => {
                    const isEditing = editingRowId === match.id;

                    return (
                      <TableRow key={match.id} data-testid={`row-match-${match.id}`}>
                        <TableCell data-testid={`text-team1-${match.id}`}>
                          {getTeamName(match.team1Id)}
                        </TableCell>
                        <TableCell data-testid={`text-team2-${match.id}`}>
                          {getTeamName(match.team2Id)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" data-testid={`badge-stage-${match.id}`}>
                            {stageLabels[match.stage as keyof typeof stageLabels]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" data-testid={`badge-status-${match.id}`}>
                            {statusLabels[match.status as keyof typeof statusLabels]}
                          </Badge>
                        </TableCell>
                        <TableCell data-testid={`text-date-${match.id}`}>
                          {match.matchDate ? (
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
                        <TableCell className="text-center">
                          {isEditing ? (
                            <div className="flex items-center justify-center gap-1">
                              <Input
                                type="number"
                                value={editingValues.team1Score || ""}
                                onChange={(e) => updateEditingValue("team1Score", e.target.value)}
                                className="h-8 w-14 text-center"
                                placeholder="0"
                                data-testid={`input-edit-score1-${match.id}`}
                              />
                              <span className="text-muted-foreground">-</span>
                              <Input
                                type="number"
                                value={editingValues.team2Score || ""}
                                onChange={(e) => updateEditingValue("team2Score", e.target.value)}
                                className="h-8 w-14 text-center"
                                placeholder="0"
                                data-testid={`input-edit-score2-${match.id}`}
                              />
                            </div>
                          ) : (
                            <span className="font-mono text-sm" data-testid={`text-score-${match.id}`}>
                              {match.team1Score ?? "—"} - {match.team2Score ?? "—"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {isEditing ? (
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
                Are you sure you want to delete all matches? This action cannot be undone.
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
      </div>
    </div>
  );
}
