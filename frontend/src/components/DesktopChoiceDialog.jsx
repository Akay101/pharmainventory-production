import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Download, WifiOff } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { useAuth } from "../App";
import { DOWNLOADS_ENABLED, FIRST_OPEN_HELP, PACKAGES, detectComputer, downloadUrl } from "../lib/desktop";

const SEEN_KEY = "dd_desktop_choice_seen";
const readSeen = () => {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
};

// Shown once per browser after sign-in, on computers, to accounts that can use the app.
export default function DesktopChoiceDialog() {
  const { user } = useAuth();
  const [computer, setComputer] = useState(null);
  const [open, setOpen] = useState(false);
  const canUse = ["ACTIVE", "TRIAL"].includes(user?.subscription?.status);

  useEffect(() => {
    if (!DOWNLOADS_ENABLED || !canUse || readSeen() || window.innerWidth < 1024) return;
    detectComputer().then((found) => {
      setComputer(found);
      if (found.os) setOpen(true);
    });
  }, [canUse]);

  if (!DOWNLOADS_ENABLED || !computer?.os) return null;
  const close = () => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {}
    setOpen(false);
  };
  const choices = computer.os === "windows" ? ["win"] : computer.best === "intel" ? ["intel", "arm"] : ["arm", "intel"];

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-lg space-y-3" data-testid="desktop-choice">
        <DialogTitle>Get DavaDesk for your computer</DialogTitle>
        <DialogDescription>You can also keep using the browser. The download stays available in Settings.</DialogDescription>
        <div className="rounded-xl border-2 border-orange-500/60 bg-orange-500/5 p-4 space-y-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-orange-600 dark:text-orange-400"><WifiOff className="h-3.5 w-3.5" aria-hidden="true" /> Works without internet</span>
          <p className="text-sm text-muted-foreground">Keep billing and buying stock when the internet is down. Everything syncs when it returns.</p>
          {choices.map((key, i) => (
            <Button key={key} asChild className="w-full" variant={i === 0 && (computer.best || computer.os === "windows") ? "default" : "outline"} onClick={close}>
              <a href={downloadUrl(key)} data-testid={`choice-download-${key}`}>
                <Download className="h-4 w-4 mr-2" aria-hidden="true" />
                Download for {PACKAGES[key].label}
              </a>
            </Button>
          ))}
          {computer.os === "mac" && <p className="text-xs text-muted-foreground">Not sure which Mac? Apple menu → About This Mac shows either an Apple chip or an Intel processor.</p>}
          <p className="text-xs text-muted-foreground" data-testid="first-open-help">First time opening it: {FIRST_OPEN_HELP[computer.os]}</p>
          <Link to="/download" className="block text-xs underline text-muted-foreground" onClick={close}>Other computers</Link>
        </div>
        <Button variant="outline" className="w-full" onClick={close} data-testid="continue-in-browser">Continue in browser</Button>
      </DialogContent>
    </Dialog>
  );
}
