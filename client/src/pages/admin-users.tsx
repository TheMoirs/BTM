import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { useToast } from "@/hooks/use-toast";
import { ShieldAlert, ShieldCheck, Trash2, Users, ArrowLeft } from "lucide-react";

interface UserRow {
  id: string;
  email: string;
  displayName: string | null;
  isSystemAdmin: boolean;
  isBlocked: boolean;
  createdAt: string;
  tournamentCount: number;
}

export default function AdminUsers() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);

  // Redirect if not system admin
  if (user && !user.isSystemAdmin) {
    navigate("/");
    return null;
  }

  const { data: usersData = [], isLoading } = useQuery<UserRow[]>({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load users");
      return res.json();
    },
  });

  const blockMutation = useMutation({
    mutationFn: async ({ id, isBlocked }: { id: string; isBlocked: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${id}/block`, { isBlocked });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (err: any) => {
      toast({
        title: "Action failed",
        description: err?.message || "Could not update user.",
        variant: "destructive",
        duration: Infinity,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/users/${id}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Delete failed");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setDeleteTarget(null);
      toast({
        title: "User deleted",
        description: "The user and all their data have been permanently removed.",
        duration: Infinity,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Delete failed",
        description: err?.message || "Could not delete user.",
        variant: "destructive",
        duration: Infinity,
      });
    },
  });

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")} data-testid="button-back-home">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">User Management</h1>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>
            Manage who has access to the platform. Blocking a user prevents them from logging in.
            Deleting a user permanently removes them and all their tournaments.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading users…</div>
          ) : usersData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No users registered yet.</div>
          ) : (
            <div className="space-y-2">
              {usersData.map(u => (
                <div
                  key={u.id}
                  className="flex items-center gap-3 p-3 rounded-md border bg-card"
                  data-testid={`row-user-${u.id}`}
                >
                  {/* User info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground truncate">
                        {u.displayName || u.email}
                      </span>
                      {u.displayName && (
                        <span className="text-sm text-muted-foreground truncate">{u.email}</span>
                      )}
                      {u.isSystemAdmin && (
                        <Badge variant="default" className="text-xs shrink-0">System Admin</Badge>
                      )}
                      {u.isBlocked && (
                        <Badge variant="destructive" className="text-xs shrink-0">Blocked</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Joined {formatDate(u.createdAt)} · {u.tournamentCount} tournament{u.tournamentCount !== 1 ? "s" : ""}
                    </div>
                  </div>

                  {/* Actions */}
                  {!u.isSystemAdmin && u.id !== user?.id && (
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => blockMutation.mutate({ id: u.id, isBlocked: !u.isBlocked })}
                        disabled={blockMutation.isPending}
                        data-testid={`button-block-user-${u.id}`}
                      >
                        {u.isBlocked ? (
                          <><ShieldCheck className="h-3.5 w-3.5 mr-1.5" />Unblock</>
                        ) : (
                          <><ShieldAlert className="h-3.5 w-3.5 mr-1.5" />Block</>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteTarget(u)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-user-${u.id}`}
                        className="text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Delete
                      </Button>
                    </div>
                  )}
                  {(u.isSystemAdmin || u.id === user?.id) && (
                    <span className="text-xs text-muted-foreground italic shrink-0">
                      {u.id === user?.id ? "You" : "Protected"}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.displayName || deleteTarget?.email}</strong> and all
              their data, including{" "}
              <strong>
                {deleteTarget?.tournamentCount} tournament{deleteTarget?.tournamentCount !== 1 ? "s" : ""}
              </strong>{" "}
              with all their teams, matches, and results. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete-user"
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
