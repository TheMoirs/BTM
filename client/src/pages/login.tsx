import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff, AlertCircle } from "lucide-react";

function PasswordInput({
  id,
  value,
  onChange,
  disabled,
  placeholder,
  autoComplete,
  "data-testid": testId,
}: {
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  placeholder?: string;
  autoComplete?: string;
  "data-testid"?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        autoComplete={autoComplete}
        data-testid={testId}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
        tabIndex={-1}
        aria-label={visible ? "Hide password" : "Show password"}
        data-testid={testId ? `${testId}-toggle` : undefined}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export default function Login() {
  const { login, register } = useAuth();
  const { toast } = useToast();

  const tokenExpired =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("expired") === "1";

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
            <img src="/btm-logo.png" alt="BTM Logo" className="h-24 w-24 rounded-xl object-cover" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Boules Tournament Manager</h1>
          <p className="text-muted-foreground text-sm">Sign in to manage your tournaments</p>
        </div>

        {/* Expired share-link banner */}
        {tokenExpired && (
          <div
            className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-destructive"
            data-testid="banner-token-expired"
          >
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-sm">Your access link has expired</p>
              <p className="text-sm text-destructive/80">
                The share link you used is no longer valid. Please ask the tournament organiser for a new link, or sign in below.
              </p>
            </div>
          </div>
        )}

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
                    <PasswordInput
                      id="signin-password"
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
                    <PasswordInput
                      id="reg-password"
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
                    <PasswordInput
                      id="reg-confirm"
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
