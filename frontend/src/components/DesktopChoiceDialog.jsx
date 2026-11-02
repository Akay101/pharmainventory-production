import { useState } from "react";
import { Link } from "react-router-dom";
import { WifiOff } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { DOWNLOADS_ENABLED } from "../lib/desktop";

const SEEN_KEY = "dd_desktop_choice_seen";
const readSeen = () => {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
};

// Shown once per browser after sign-in, on computers only.
export default function DesktopChoiceDialog() {
  const [open, setOpen] = useState(() => DOWNLOADS_ENABLED && !readSeen() && window.innerWidth >= 1024);
  if (!DOWNLOADS_ENABLED) return null;
  const close = () => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {}
    setOpen(false);
  };
  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-lg space-y-3">
        <DialogTitle>How would you like to use DavaDesk?</DialogTitle>
        <DialogDescription>You can change your mind at any time from Settings.</DialogDescription>
        <div className="rounded-xl border-2 border-orange-500/60 bg-orange-500/5 p-4 space-y-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-orange-600 dark:text-orange-400"><WifiOff className="h-3.5 w-3.5" aria-hidden="true" /> Works without internet</span>
          <p className="font-bold">Download the desktop app</p>
          <p className="text-sm text-muted-foreground">Keep billing and buying stock when the internet is down. Everything syncs when it returns.</p>
          <Button asChild className="w-full" onClick={close}><Link to="/download">See downloads</Link></Button>
        </div>
        <Button variant="outline" className="w-full" onClick={close} data-testid="continue-in-browser">Continue in browser</Button>
      </DialogContent>
    </Dialog>
  );
}
