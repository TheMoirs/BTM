import { SignIn } from "@clerk/react";
import { clerkAppearance } from "@/App";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 gap-6">
      {/* Branding */}
      <div className="text-center space-y-2">
        <div className="flex justify-center">
          <img src="/btm-logo.png" alt="BTM Logo" className="h-20 w-20 rounded-xl object-cover" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Boules Tournament Manager</h1>
        <p className="text-muted-foreground text-sm">Sign in to manage your tournaments</p>
      </div>

      {/* Clerk sign-in — routing="path" is required for OAuth callbacks */}
      <div className="flex justify-center w-full">
        <SignIn
          routing="path"
          path={`${basePath}/sign-in`}
          signUpUrl={`${basePath}/sign-up`}
          forceRedirectUrl={`${basePath}/teams`}
          appearance={clerkAppearance}
        />
      </div>
    </div>
  );
}
