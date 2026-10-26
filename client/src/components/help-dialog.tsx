import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "lucide-react";

interface HelpDialogProps {
  title: string;
  children: React.ReactNode;
  /** Show a text label ("Help") next to the icon */
  label?: string;
  /** Let a page open it from elsewhere too (e.g. the phone ☰ menu, which closes when tapped) */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Extra classes for the Help button, e.g. "hidden sm:inline-flex" to hide it on phones */
  triggerClassName?: string;
}

export function HelpDialog({ title, children, label, open: openProp, onOpenChange, triggerClassName = "" }: HelpDialogProps) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (value: boolean) => (onOpenChange ? onOpenChange(value) : setOpenState(value));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {label ? (
          <Button variant="outline" size="sm" className={`flex-shrink-0 px-2 ${triggerClassName}`} data-testid="button-help" aria-label="Open help dialog">
            <HelpCircle className="h-4 w-4 sm:mr-1.5" />
            {/* "?" alone on phones to save room; label on wider screens */}
            <span className="hidden sm:inline">{label}</span>
          </Button>
        ) : (
          <Button
            variant="outline"
            size="icon"
            className={triggerClassName}
            data-testid="button-help"
            aria-label="Open help dialog"
          >
            <HelpCircle className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-4 text-foreground">
              {children}
            </div>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
