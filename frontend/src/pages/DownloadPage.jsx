import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Download, WifiOff } from "lucide-react";
import { Button } from "../components/ui/button";
import { FIRST_OPEN_HELP, PACKAGES, detectComputer, downloadUrl } from "../lib/desktop";

const AppleLogo = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
  </svg>
);

const WindowsLogo = (props) => (
  <svg viewBox="0 0 24 24" fill="#0078D4" aria-hidden="true" {...props}>
    <rect x="1" y="1" width="10.5" height="10.5" />
    <rect x="12.5" y="1" width="10.5" height="10.5" />
    <rect x="1" y="12.5" width="10.5" height="10.5" />
    <rect x="12.5" y="12.5" width="10.5" height="10.5" />
  </svg>
);

const ICONS = { win: WindowsLogo, arm: AppleLogo, intel: AppleLogo };

const POINTS = [
  "Billing, purchases, CSV import and stock keep working with no internet",
  "Everything syncs with your account as soon as you're back online",
  "Medicine, doctor and distributor search works offline",
  "All online features, including AI, work as usual when connected",
  "Optionally connect several counters in the shop",
];

export default function DownloadPage() {
  const [best, setBest] = useState(null);
  useEffect(() => {
    detectComputer().then((c) => setBest(c.best));
    document.title = "Download DavaDesk";
  }, []);
  const order = best ? [best, ...Object.keys(PACKAGES).filter((k) => k !== best)] : Object.keys(PACKAGES);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-10 space-y-10">
        <Link to="/" className="inline-flex items-center gap-3" aria-label="DavaDesk home" data-testid="download-brand">
          <img src="/assets/svgs/logoBrand/logoOnlyWithoutBackground.svg" alt="" className="w-11 h-11 object-contain shrink-0" />
          <span className="flex flex-col">
            <span className="font-extrabold text-xl tracking-tight text-foreground leading-tight">DavaDesk</span>
            <span className="text-xs font-semibold text-muted-foreground">Smart Pharmacy Software</span>
          </span>
        </Link>

        <header className="space-y-4">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/10 px-3 py-1 text-xs font-bold text-orange-600 dark:text-orange-400">
            <WifiOff className="h-3.5 w-3.5" aria-hidden="true" /> Works without internet
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">DavaDesk for your computer</h1>
          <p className="text-muted-foreground max-w-prose">Keep your counter running when the internet goes down. Install it, sign in once with your active subscription, and it's ready. Nothing else to set up.</p>
        </header>

        <section className="grid gap-3" aria-label="Downloads">
          {order.map((key, i) => {
            const pkg = PACKAGES[key];
            const Icon = ICONS[key];
            const primary = i === 0 && !!best;
            return (
              <div key={key} className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-5 ${primary ? "border-orange-500/60 bg-orange-500/5" : "border-border/60 bg-card"}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background">
                    <Icon className="h-6 w-6 text-foreground" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold">{pkg.label}{primary && <span className="ml-2 text-xs font-semibold text-orange-600 dark:text-orange-400">Recommended for this computer</span>}</p>
                    <p className="text-sm text-muted-foreground">{pkg.note}</p>
                  </div>
                </div>
                <Button asChild variant={primary ? "default" : "outline"}>
                  <a href={downloadUrl(key)} data-testid={`download-${key}`}><Download className="h-4 w-4 mr-2" aria-hidden="true" />Download</a>
                </Button>
              </div>
            );
          })}
          <p className="text-sm text-muted-foreground">Not sure which Mac? Apple menu → About This Mac shows either an Apple chip or an Intel processor.</p>
        </section>

        <section className="space-y-2" data-testid="first-open-help">
          <h2 className="text-lg font-bold">Opening it the first time</h2>
          <p className="text-sm text-muted-foreground"><strong className="text-foreground">Mac:</strong> {FIRST_OPEN_HELP.mac}</p>
          <p className="text-sm text-muted-foreground"><strong className="text-foreground">Windows:</strong> {FIRST_OPEN_HELP.windows}</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold">What you get</h2>
          <ul className="space-y-2">
            {POINTS.map((p) => (
              <li key={p} className="flex gap-2 text-sm"><Check className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" aria-hidden="true" />{p}</li>
            ))}
          </ul>
        </section>

        <p className="text-sm text-muted-foreground">
          The desktop app needs a DavaDesk account with an active subscription. <Link className="underline" to="/register">Create an account</Link> or <Link className="underline" to="/dashboard">continue in your browser</Link>.
        </p>
      </main>
    </div>
  );
}
