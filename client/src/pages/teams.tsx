import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTeamSchema, type Team, type InsertTeam } from "@shared/schema";
import { Plus, Mail, Phone, User, Pencil, Trash2, Users } from "lucide-react";
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

export default function Teams() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [deletingTeam, setDeletingTeam] = useState<Team | null>(null);
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
      setEditingTeam(null);
      form.reset();
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

  const onSubmit = (data: InsertTeam) => {
    if (editingTeam) {
      updateMutation.mutate({ id: editingTeam.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (team: Team) => {
    setEditingTeam(team);
    form.reset({
      name: team.name,
      captainName: team.captainName,
      captainPhone: team.captainPhone,
      captainEmail: team.captainEmail,
    });
  };

  const handleCloseDialog = () => {
    setIsCreateOpen(false);
    setEditingTeam(null);
    form.reset();
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
          <Dialog open={isCreateOpen || !!editingTeam} onOpenChange={(open) => {
            if (!open) handleCloseDialog();
            else setIsCreateOpen(true);
          }}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-team">
                <Plus className="h-4 w-4 mr-2" />
                Register Team
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]" aria-describedby="team-form-description">
              <DialogHeader>
                <DialogTitle>
                  {editingTeam ? "Edit Team" : "Register New Team"}
                </DialogTitle>
                <p id="team-form-description" className="sr-only">
                  {editingTeam ? "Update team information and captain contact details" : "Enter team name and captain contact information to register a new team"}
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
                      onClick={handleCloseDialog}
                      className="flex-1"
                      data-testid="button-cancel"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1"
                      disabled={createMutation.isPending || updateMutation.isPending}
                      data-testid="button-submit-team"
                    >
                      {createMutation.isPending || updateMutation.isPending
                        ? "Saving..."
                        : editingTeam
                        ? "Update Team"
                        : "Register Team"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {teams.map((team) => (
              <Card key={team.id} className="hover-elevate" data-testid={`card-team-${team.id}`}>
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-card-foreground" data-testid={`text-team-name-${team.id}`}>
                      {team.name}
                    </h3>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleEdit(team)}
                      data-testid={`button-edit-${team.id}`}
                    >
                      <Pencil className="h-4 w-4" />
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
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">
                      Team Captain
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="text-card-foreground" data-testid={`text-captain-name-${team.id}`}>
                          {team.captainName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span className="text-card-foreground" data-testid={`text-captain-phone-${team.id}`}>
                          {team.captainPhone}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="text-card-foreground" data-testid={`text-captain-email-${team.id}`}>
                          {team.captainEmail}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
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
      </div>
    </div>
  );
}
