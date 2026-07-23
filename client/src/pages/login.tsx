import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trophy } from "lucide-react";

export default function Login() {
  const { login, register } = useAuth();
  const { toast } = useToast();

  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [signInLoading, setSignInLoading] = useState(false);

  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [regName, setRegName] = useState("");
  const [regLoading, setRegLoading] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignInLoading(true);
    const result = await login(signInEmail.trim(), signInPassword);
    setSignInLoading(false);
    if (!result.success) {
      toast({
        title: "Sign in failed",
        description: result.error || "Invalid email or password.",
        variant: "destructive",
        duration: Infinity,
      });
    }
    // On success, AuthContext updates user state and the app re-renders
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (regPassword !== regConfirm) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both passwords are the same.",
        variant: "destructive",
        duration: Infinity,
      });
      return;
    }
    setRegLoading(true);
    const result = await register(regEmail.trim(), regPassword, regName.trim() || undefined);
    setRegLoading(false);
    if (!result.success) {
      toast({
        title: "Registration failed",
        description: result.error || "Could not create account.",
        variant: "destructive",
        duration: Infinity,
      });
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo / Title */}
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="bg-primary rounded-full p-3">
              <Trophy className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Boules Tournament Manager</h1>
          <p className="text-muted-foreground text-sm">Sign in to manage your tournaments</p>
        </div>

        <Tabs defaultValue="signin">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin" data-testid="tab-signin">Sign In</TabsTrigger>
            <TabsTrigger value="register" data-testid="tab-register">Create Account</TabsTrigger>
          </TabsList>

          {/* Sign In */}
          <TabsContent value="signin">
            <Card>
              <CardHeader>
                <CardTitle>Sign In</CardTitle>
                <CardDescription>Enter your email and password to access your tournaments.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Email</Label>
                    <Input
                      id="signin-email"
                      type="email"
                      placeholder="you@example.com"
                      value={signInEmail}
                      onChange={e => setSignInEmail(e.target.value)}
                      disabled={signInLoading}
                      autoComplete="email"
                      data-testid="input-signin-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signin-password">Password</Label>
                    <Input
                      id="signin-password"
                      type="password"
                      placeholder="••••••••"
                      value={signInPassword}
                      onChange={e => setSignInPassword(e.target.value)}
                      disabled={signInLoading}
                      autoComplete="current-password"
                      data-testid="input-signin-password"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={signInLoading || !signInEmail || !signInPassword}
                    data-testid="button-signin-submit"
                  >
                    {signInLoading ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Signing in…</>
                    ) : "Sign In"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Create Account */}
          <TabsContent value="register">
            <Card>
              <CardHeader>
                <CardTitle>Create Account</CardTitle>
                <CardDescription>Register to start managing your own tournaments.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reg-name">Your Name <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <Input
                      id="reg-name"
                      type="text"
                      placeholder="Ali Moir"
                      value={regName}
                      onChange={e => setRegName(e.target.value)}
                      disabled={regLoading}
                      autoComplete="name"
                      data-testid="input-reg-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-email">Email</Label>
                    <Input
                      id="reg-email"
                      type="email"
                      placeholder="you@example.com"
                      value={regEmail}
                      onChange={e => setRegEmail(e.target.value)}
                      disabled={regLoading}
                      autoComplete="email"
                      data-testid="input-reg-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-password">Password</Label>
                    <Input
                      id="reg-password"
                      type="password"
                      placeholder="At least 8 characters"
                      value={regPassword}
                      onChange={e => setRegPassword(e.target.value)}
                      disabled={regLoading}
                      autoComplete="new-password"
                      data-testid="input-reg-password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-confirm">Confirm Password</Label>
                    <Input
                      id="reg-confirm"
                      type="password"
                      placeholder="••••••••"
                      value={regConfirm}
                      onChange={e => setRegConfirm(e.target.value)}
                      disabled={regLoading}
                      autoComplete="new-password"
                      data-testid="input-reg-confirm"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={regLoading || !regEmail || !regPassword || !regConfirm}
                    data-testid="button-reg-submit"
                  >
                    {regLoading ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating account…</>
                    ) : "Create Account"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
