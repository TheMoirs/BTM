import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTeamSchema, type Team, type InsertTeam } from "@shared/schema";
import { Plus, Trash2, Users, Upload, Check, X, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
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

type SortColumn = "name" | "division" | "captainName" | "captainPhone" | "captainEmail";
type SortDirection = "asc" | "desc";

export default function Teams() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingValues, setEditingValues] = useState<Partial<InsertTeam>>({});
  const [deletingTeam, setDeletingTeam] = useState<Team | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { data: teams, isLoading } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const form = useForm<InsertTeam>({
    resolver: zodResolver(insertTeamSchema),
    defaultValues: {
      name: "",
      captainName: "",
      captainPhone: "",
      captainEmail: "",
      division: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertTeam) => apiRequest("POST", "/api/teams", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      setIsCreateOpen(false);
      form.reset();
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
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: InsertTeam }) =>
      apiRequest("PATCH", `/api/teams/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
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

    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        
        // Get the first sheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to JSON
        const teamsData = XLSX.utils.sheet_to_json(worksheet) as Array<{
          name?: string;
          captainName?: string;
          captainPhone?: string;
          captainEmail?: string;
          division?: string;
        }>;

        let successCount = 0;
        let errorCount = 0;

        for (const row of teamsData) {
          if (!row.name || !row.captainName || !row.captainPhone || !row.captainEmail) {
            errorCount++;
            continue;
          }

          try {
            const teamData: InsertTeam = {
              name: capitalizeWords(String(row.name).trim()),
              captainName: capitalizeWords(String(row.captainName).trim()),
              captainPhone: String(row.captainPhone).trim(),
              captainEmail: String(row.captainEmail).trim(),
              division: row.division ? String(row.division).trim().toUpperCase() : null,
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
          }
        }

        queryClient.invalidateQueries({ queryKey: ["/api/teams"] });

        toast({
          title: "Import complete",
          description: `Successfully imported ${successCount} team(s). ${errorCount > 0 ? `${errorCount} failed.` : ''}`,
          variant: errorCount > 0 ? "destructive" : "default",
        });
      } catch (error) {
        toast({
          title: "Import failed",
          description: "Failed to parse Excel file.",
          variant: "destructive",
        });
      }

      resetFileInput();
    };

    reader.onerror = () => {
      toast({
        title: "Import failed",
        description: "Failed to read Excel file.",
        variant: "destructive",
      });
      resetFileInput();
    };

    reader.readAsBinaryString(file);
  };

  const onSubmit = (data: InsertTeam) => {
    const capitalizedData: InsertTeam = {
      name: capitalizeWords(data.name.trim()),
      captainName: capitalizeWords(data.captainName.trim()),
      captainPhone: data.captainPhone.trim(),
      captainEmail: data.captainEmail.trim(),
      division: data.division?.trim().toUpperCase() || null,
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
    });
  };

  const cancelEditing = () => {
    setEditingRowId(null);
    setEditingValues({});
  };

  const saveEditing = (teamId: string) => {
    const capitalizedData: InsertTeam = {
      name: capitalizeWords(editingValues.name?.trim() || ""),
      captainName: capitalizeWords(editingValues.captainName?.trim() || ""),
      captainPhone: editingValues.captainPhone?.trim() || "",
      captainEmail: editingValues.captainEmail?.trim() || "",
      division: editingValues.division?.trim().toUpperCase() || null,
    };
    
    updateMutation.mutate({ id: teamId, data: capitalizedData });
  };

  const updateEditingValue = (field: keyof InsertTeam, value: string) => {
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
      let aValue = a[sortColumn] || "";
      let bValue = b[sortColumn] || "";
      
      // Convert to lowercase for case-insensitive sorting
      if (typeof aValue === "string") aValue = aValue.toLowerCase();
      if (typeof bValue === "string") bValue = bValue.toLowerCase();
      
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Teams</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage registered teams and captain contact details
            </p>
          </div>
          <div className="flex gap-2">
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
              onClick={() => fileInputRef.current?.click()}
              data-testid="button-import-excel"
            >
              <Upload className="h-4 w-4 mr-2" />
              Import Excel
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowClearConfirm(true)}
              data-testid="button-clear-all-teams"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All Data
            </Button>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-team">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Team
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
                Get started by registering your first team for the league
                competition
              </p>
              <Button onClick={() => setIsCreateOpen(true)} data-testid="button-register-first-team">
                <Plus className="h-4 w-4 mr-2" />
                Register Your First Team
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
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
                    <TableHead className="w-[120px] text-right">Actions</TableHead>
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
      </div>
    </div>
  );
}
