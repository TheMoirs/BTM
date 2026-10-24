import { useState } from "react";
import { Link, Redirect } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

// Opened from the "Reset your password" email: /reset-password?code=...
export default function ResetPasswordPage() {
  const { resetPassword } = useAuth();
  const { toast } = useToast();
  const token = new URLSearchParams(window.location.search).get("code") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (done) return <Redirect to="/teams" />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast({ title: "Passwords don't match", description: "Please make sure both passwords are the same.", variant: "destructive", duration: Infinity });
      return;
    }
    if (password.length < 8) {
      toast({ title: "Password too short", description: "Your password must be at least 8 characters.", variant: "destructive", duration: Infinity });
      return;
    }
    setLoading(true);
    const result = await resetPassword(token, password);
    setLoading(false);
    if (result.success) {
      toast({ title: "Password set", description: "You're now signed in." });
      setDone(true);
    } else {
      toast({ title: "Couldn't set password", description: result.error, variant: "destructive", duration: Infinity });
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <img src="/ptm-logo.png?v=2" alt="PTM Logo" className="h-20 w-20 rounded-xl object-cover" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Pétanque Tournament Manager</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Choose a new password</CardTitle>
            <CardDescription>Enter a new password for your account (at least 8 characters).</CardDescription>
          </CardHeader>
          <CardContent>
            {!token ? (
              <p className="text-sm text-muted-foreground">
                This link is incomplete. Please use the link from your email, or{" "}
                <Link href="/sign-in" className="underline">request a new one</Link>.
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    disabled={loading}
                    autoComplete="new-password"
                    data-testid="input-reset-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm new password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    disabled={loading}
                    autoComplete="new-password"
                    data-testid="input-reset-confirm"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading || !password || !confirm} data-testid="button-reset-submit">
                  {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : "Set password and sign in"}
                </Button>
                <p className="text-center text-sm">
                  <Link href="/sign-in" className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">
                    Back to sign in
                  </Link>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
