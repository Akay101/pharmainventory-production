// Settings › Devices: this account's live session, past sign-ins, desktop
// apps, and (for admins) who in the team is signed in where.
import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Clock, Laptop, Loader2, LogOut, MapPin, Monitor, RefreshCw, Smartphone, Tablet, Users } from "lucide-react";
import { API, useAuth } from "../../App";
import { IS_DESKTOP } from "../../lib/desktop";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import DesktopDevicesCard from "../DesktopDevicesCard";

const when = (d) => (d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "-");
const ago = (d) => {
  if (!d) return "";
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
};
const END_TEXT = {
  LOGOUT: "Signed out",
  REPLACED: "Signed in on another device",
  REMOTE_LOGOUT: "Signed out from Devices",
  ADMIN_LOGOUT: "Signed out by an admin",
  PASSWORD_RESET: "Password changed",
  PASSWORD_RESET_LINK: "Password changed",
  LOGOUT_ALL: "Signed out everywhere",
  USER_DISABLED: "User switched off",
  NO_PHARMACY_ACCESS: "Pharmacy access removed",
};
const Icon = ({ type, className }) => (type === "mobile" ? <Smartphone className={className} /> : type === "tablet" ? <Tablet className={className} /> : <Monitor className={className} />);

function SessionRow({ s, onEnd, ending, label }) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl border p-3.5 ${s.current ? "border-emerald-500/40 bg-emerald-500/5" : "border-border/70 bg-card/60"}`} data-testid="session-row">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${s.active ? "bg-orange-500/10 text-orange-600" : "bg-muted text-muted-foreground"}`}>
        <Icon type={s.type} className="w-5 h-5" />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-bold truncate">
          {label ? `${label} · ` : ""}
          {s.device}
          {s.current && <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700 dark:text-emerald-400">This device</span>}
        </p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs font-semibold text-muted-foreground">
          {s.location && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {s.location}
            </span>
          )}
          {s.ip && <span>{s.ip}</span>}
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> {s.active ? `Active ${ago(s.last_active_at)}` : `${END_TEXT[s.end_reason] || "Ended"} · ${when(s.ended_at)}`}
          </span>
          <span>Signed in {when(s.started_at)}</span>
        </p>
      </div>
      {s.active && onEnd && (
        <Button size="sm" variant="outline" className="rounded-xl shrink-0 text-destructive border-destructive/30 hover:bg-destructive/10" disabled={ending} onClick={() => onEnd(s)}>
          {ending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><LogOut className="w-3.5 h-3.5 mr-1.5" />{s.current ? "Sign out" : "Sign out device"}</>}
        </Button>
      )}
    </div>
  );
}

export default function DeviceManager({ active }) {
  const { logout, isAdmin } = useAuth();
  const [data, setData] = useState(null);
  const [ending, setEnding] = useState(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/account/sessions`);
      setData(r.data);
    } catch (e) {
      if (!e.permissionToastShown) toast.error(e.response?.data?.detail || "Couldn't load devices");
    }
  }, []);

  useEffect(() => {
    if (active) load();
  }, [active, load]);

  const end = async (s) => {
    setEnding(s.id);
    try {
      const r = await axios.delete(`${API}/account/sessions/${s.id}`);
      toast.success(r.data.message);
      if (r.data.signed_out_self) return logout(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't sign that device out");
    } finally {
      setEnding(null);
    }
  };

  const current = data?.sessions?.filter((s) => s.active) || [];
  const past = data?.sessions?.filter((s) => !s.active) || [];
  const teamLive = data?.team?.filter((t) => t.session) || [];

  return (
    <div className="space-y-6" data-testid="device-manager">
      <Card className="bg-card/50 backdrop-blur-sm border-white/5">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Laptop className="w-5 h-5 text-primary" /> Signed-in device
            </CardTitle>
            <CardDescription>Your account can be signed in on one device at a time. Signing in somewhere else signs this one out, after asking.</CardDescription>
          </div>
          <Button variant="ghost" size="icon" className="rounded-xl shrink-0" onClick={load} aria-label="Refresh">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {!data ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : current.length ? (
            current.map((s) => <SessionRow key={s.id} s={s} onEnd={end} ending={ending === s.id} />)
          ) : (
            <p className="text-sm text-muted-foreground font-semibold">{IS_DESKTOP ? "The desktop app signs in through the browser; see Desktop apps below." : "No live session."}</p>
          )}
        </CardContent>
      </Card>

      {isAdmin && data && (
        <Card className="bg-card/50 backdrop-blur-sm border-white/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" /> Team sessions
            </CardTitle>
            <CardDescription>Where each pharmacist user is signed in right now. Sign a device out if it shouldn't be using your pharmacy.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {teamLive.length ? (
              teamLive.map((t) => <SessionRow key={t.user_id} s={t.session} label={t.name} onEnd={t.is_owner ? null : end} ending={ending === t.session.id} />)
            ) : (
              <p className="text-sm text-muted-foreground font-semibold">Nobody else is signed in.</p>
            )}
          </CardContent>
        </Card>
      )}

      {!IS_DESKTOP && <DesktopDevicesCard />}

      {data && past.length > 0 && (
        <Card className="bg-card/50 backdrop-blur-sm border-white/5">
          <CardHeader>
            <CardTitle>Sign-in history</CardTitle>
            <CardDescription>Your past sessions on this account, newest first.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {(showAll ? past : past.slice(0, 6)).map((s) => (
              <SessionRow key={s.id} s={s} />
            ))}
            {past.length > 6 && (
              <Button variant="ghost" className="w-full rounded-xl" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Show less" : `Show all ${past.length}`}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
