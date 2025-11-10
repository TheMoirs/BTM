import { useState } from "react";
import { useTournament } from "@/contexts/TournamentContext";
import { useViewMode } from "@/contexts/ViewModeContext";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTournamentSchema, type InsertTournament, type Tournament } from "@shared/schema";
import { Trophy, Plus, ChevronDown, Trash2, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";

export function TournamentSelector() {
  const { currentTournament, selectTournament, createTournament, updateTournament, deleteTournament } = useTournament();
  const { isReadOnly, isMasterAdmin } = useViewMode();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  const [deletingTournament, setDeletingTournament] = useState<Tournament | null>(null);
  const { toast } = useToast();

  const { data: tournaments } = useQuery<Tournament[]>({
    queryKey: ["/api/tournaments"],
  });

  const form = useForm<InsertTournament>({
    resolver: zodResolver(insertTournamentSchema),
    defaultValues: {
      name: "",
      numberOfDivisions: 2,
      gamesPerMatch: 3,
      hasQuarterFinals: false,
      hasSemiFinals: false,
      hasFinals: true,
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

  const handleEditTournament = async (data: InsertTournament) => {
    if (!editingTournament) return;
    try {
      await updateTournament(editingTournament.id, data);
      setEditingTournament(null);
      form.reset();
      toast({
        title: "Tournament updated",
        description: `${data.name} has been updated successfully.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update tournament",
        variant: "destructive",
        duration: Infinity,
      });
    }
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

  const getTournamentDetails = (tournament: Tournament) => {
    const stages = [];
    if (tournament.hasQuarterFinals) stages.push("QF");
    if (tournament.hasSemiFinals) stages.push("SF");
    if (tournament.hasFinals) stages.push("F");
    return `${tournament.numberOfDivisions} div${tournament.numberOfDivisions !== 1 ? 's' : ''} • ${tournament.gamesPerMatch} game${tournament.gamesPerMatch !== 1 ? 's' : ''} • ${stages.join(', ') || 'No stages'}`;
  };

  if (!currentTournament) {
    return (
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" data-testid="button-create-first-tournament">
            <Plus className="h-4 w-4 mr-2" />
            Create Tournament
          </Button>
        </DialogTrigger>
        <DialogContent data-testid="dialog-create-tournament">
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
    );
  }

  // In read-only mode, show tournament name without dropdown
  if (isReadOnly) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-background" data-testid="tournament-display-readonly">
        <Trophy className="h-4 w-4 text-muted-foreground" />
        <div className="flex flex-col items-start">
          <span className="font-medium text-sm">{currentTournament.name}</span>
          <span className="text-xs text-muted-foreground">{getTournamentDetails(currentTournament)}</span>
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
                      numberOfDivisions: tournament.numberOfDivisions,
                      gamesPerMatch: tournament.gamesPerMatch,
                      hasQuarterFinals: tournament.hasQuarterFinals,
                      hasSemiFinals: tournament.hasSemiFinals,
                      hasFinals: tournament.hasFinals,
                    });
                  }}
                  data-testid={`button-edit-tournament-${tournament.id}`}
                >
                  <Pencil className="h-3 w-3" />
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
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setIsCreateOpen(true)} data-testid="button-create-new-tournament">
            <Plus className="h-4 w-4 mr-2" />
            Create New Tournament
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent data-testid="dialog-create-tournament">
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
        <DialogContent data-testid="dialog-edit-tournament">
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

              <div className="flex gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingTournament(null);
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
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingTournament?.name}"? This will permanently delete all teams,
              matches, and results associated with this tournament. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingTournament && handleDeleteTournament(deletingTournament)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete Tournament
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
