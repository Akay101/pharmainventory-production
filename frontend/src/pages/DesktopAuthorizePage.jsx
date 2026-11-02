import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import { MonitorCheck } from "lucide-react";
import { API, useAuth } from "../App";
import { Button } from "../components/ui/button";

// Opened by the desktop app in the normal browser. The signed-in user decides
// whether this computer may use the account; only an active subscription passes.
export default function DesktopAuthorizePage() {
  const [params] = useSearchParams();
  const { user, pharmacy } = useAuth();
  const challenge = params.get("challenge") || "";
  const state = params.get("state") || "";
  const name = (params.get("name") || "this computer").slice(0, 80);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");

  const allow = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await axios.post(`${API}/desktop/authorize`, { code_challenge: challenge, device_name: name });
      setCode(r.data.code);
      window.location.href = `davadesk://auth?code=${encodeURIComponent(r.data.code)}&state=${encodeURIComponent(state)}`;
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't approve this computer. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card p-8 space-y-4">
        <MonitorCheck className="h-9 w-9 text-orange-500" aria-hidden="true" />
        {code ? (
          <>
            <h1 className="text-xl font-bold">Computer allowed</h1>
            <p className="text-sm text-muted-foreground">Go back to DavaDesk on your computer. If it hasn't continued by itself, paste this code there:</p>
            <p className="font-mono text-xs break-all rounded-lg border border-border/60 p-3 select-all" data-testid="desktop-code">{code}</p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold">Allow DavaDesk on {name}?</h1>
            <p className="text-sm text-muted-foreground">
              Signed in as <strong>{user?.email}</strong> for <strong>{pharmacy?.name}</strong>. This computer will get a copy of your shop's data, and keep it in sync. Only allow a computer you started this from. You can remove it later in Settings.
            </p>
            {!/^[A-Za-z0-9_-]{43}$/.test(challenge) && <p className="text-sm font-semibold text-destructive">This link is incomplete. Please start again from the desktop app.</p>}
            {error && <p className="text-sm font-semibold text-destructive" role="alert">{error}</p>}
            <Button className="w-full" onClick={allow} disabled={busy || !/^[A-Za-z0-9_-]{43}$/.test(challenge)} data-testid="desktop-allow">Allow this computer</Button>
          </>
        )}
      </div>
    </div>
  );
}
