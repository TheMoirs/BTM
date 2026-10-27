import { useEffect, useState } from "react";
import { useLocation } from "wouter";
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
import { PLAN_LIMIT_EVENT } from "@/lib/queryClient";

/** Pops up whenever the server says a free-plan limit was reached */
export function PlanLimitDialog() {
  const [message, setMessage] = useState<string | null>(null);
  const [, navigate] = useLocation();

  useEffect(() => {
    const show = (e: Event) => setMessage((e as CustomEvent<string>).detail);
    window.addEventListener(PLAN_LIMIT_EVENT, show);
    return () => window.removeEventListener(PLAN_LIMIT_EVENT, show);
  }, []);

  return (
    <AlertDialog open={!!message} onOpenChange={(open) => !open && setMessage(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Free plan limit reached</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-plan-limit-close">Not now</AlertDialogCancel>
          <AlertDialogAction
            data-testid="button-plan-limit-upgrade"
            onClick={() => {
              setMessage(null);
              navigate("/plan");
            }}
          >
            See plans
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
