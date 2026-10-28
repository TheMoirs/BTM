import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// The demo video lives in client/public/demo/, so it is served at this address.
export const DEMO_VIDEO_URL = "/demo/ptm-demo.mp4";

let demoAvailable: Promise<boolean> | null = null;

/** True once we know the demo video file is on the server (the menu item hides otherwise) */
export function useDemoAvailable(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    demoAvailable ??= fetch(DEMO_VIDEO_URL, { method: "HEAD" })
      .then((r) => r.ok && (r.headers.get("content-type") || "").startsWith("video/"))
      .catch(() => false);
    let live = true;
    demoAvailable.then((v) => live && setOk(v));
    return () => {
      live = false;
    };
  }, []);
  return ok;
}

export function DemoVideoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>PTM demo</DialogTitle>
          <DialogDescription>A quick tour of setting up and running a tournament.</DialogDescription>
        </DialogHeader>
        {open && (
          <video
            src={DEMO_VIDEO_URL}
            controls
            autoPlay
            playsInline
            className="w-full rounded-md bg-black aspect-video"
            data-testid="video-demo"
          >
            Your browser can't play this video.
          </video>
        )}
      </DialogContent>
    </Dialog>
  );
}
