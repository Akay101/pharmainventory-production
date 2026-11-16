import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { API } from "../App";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { DOWNLOADS_ENABLED } from "../lib/desktop";

// Computers signed in to the desktop app. Removing one ends its access at its next
// connection, or when its offline licence runs out if it never connects again.
export default function DesktopDevicesCard() {
  const [devices, setDevices] = useState([]);
  const load = () => axios.get(`${API}/desktop/devices`).then((r) => setDevices(r.data.devices || [])).catch(() => {});
  useEffect(() => {
    load();
  }, []);
  if (!DOWNLOADS_ENABLED && !devices.length) return null;

  const remove = async (device) => {
    if (!window.confirm(`Remove ${device.name}? It will stop working with this account.`)) return;
    try {
      await axios.delete(`${API}/desktop/devices/${device.id}`);
      toast.success("Computer removed");
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Couldn't remove this computer");
    }
  };

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-white/5 mb-6" data-testid="desktop-devices-card">
      <CardHeader>
        <CardTitle>Desktop app</CardTitle>
        <CardDescription>Works without internet and stays in sync with this account.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {devices.map((device) => (
          <div key={device.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{device.name}{device.last_seen_at && <span className="text-muted-foreground"> · last online {new Date(device.last_seen_at).toLocaleDateString("en-IN")}</span>}</span>
            <Button size="sm" variant="outline" onClick={() => remove(device)}>Remove</Button>
          </div>
        ))}
        {DOWNLOADS_ENABLED && <Button asChild variant="outline"><Link to="/download">Download desktop app</Link></Button>}
      </CardContent>
    </Card>
  );
}
