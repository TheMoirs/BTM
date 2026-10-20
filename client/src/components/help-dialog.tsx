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
}

export function HelpDialog({ title, children, label }: HelpDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {label ? (
          <Button variant="outline" size="sm" className="flex-shrink-0 px-2" data-testid="button-help" aria-label="Open help dialog">
            <HelpCircle className="h-4 w-4 mr-1.5" />
            {label}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="icon"
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
