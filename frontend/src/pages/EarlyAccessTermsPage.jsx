import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { ArrowLeft, Bug, CalendarClock, Check, Coins, FileText, Loader2, LogOut, Medal, ShieldCheck, Sparkles } from "lucide-react";
import { API, useAuth } from "../App";
import { Button } from "../components/ui/button";
import Loader from "../components/Loader";
import ThemeToggle from "../components/ui/ThemeToggle";

// Early access terms: shown right after an access code activates DavaDesk,
// and required (once per user, per version) before the app opens for
// pharmacies on an early access (PROMO) plan. Bump the version, here and in
// backend-node/routes/users.js, to ask everyone to accept again.
export const EARLY_ACCESS_TERMS_VERSION = 1;
const EFFECTIVE = "26 October 2026";
const INACTIVE_DAYS = 7;

export const needsEarlyAccessTerms = (user) => {
  const sub = user?.subscription;
  if (!sub || sub.kind !== "PROMO" || sub.status !== "ACTIVE") return false;
  return (user.early_access_terms?.version || 0) < EARLY_ACCESS_TERMS_VERSION;
};

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "");

const HIGHLIGHTS = [
  {
    icon: Bug,
    tone: "from-rose-500 to-orange-500",
    title: "It's early: expect a few bugs",
    text: "You may run into bugs or rough edges. Tell us through Help & Support and we'll fix them fast.",
  },
  {
    icon: CalendarClock,
    tone: "from-amber-500 to-orange-500",
    title: `Use it, or the seat moves on`,
    text: `Early access seats are limited. After ${INACTIVE_DAYS} days with no activity, your access may pass to the next pharmacy in the queue.`,
  },
  {
    icon: Medal,
    tone: "from-violet-500 to-fuchsia-500",
    title: "Ideas earn a Partner badge",
    text: "If we build your idea or feedback, you become a DavaDesk Partner and we credit you for it.",
  },
  {
    icon: Coins,
    tone: "from-emerald-500 to-teal-500",
    title: "AI runs on credits",
    text: "The assistant, invoice and pack scans and voice use AI credits. When they run out, AI features pause until they refresh.",
  },
];

// Section id, title, paragraphs (strings) or lists ({ list: [...] })
const SECTIONS = [
  {
    id: "about",
    title: "About early access",
    body: [
      "DavaDesk early access gives a limited number of pharmacies complimentary use of DavaDesk before its public launch. Your access was activated with an early access code; the plan and the number of days it covers are shown in the app and on the Plans page.",
      "Early access is free. We don't ask for card details and nothing is charged automatically when it ends.",
      "These terms apply to everyone in your pharmacy who uses DavaDesk during early access. Each person accepts them once, the first time they open the app.",
    ],
  },
  {
    id: "preview",
    title: "A preview, not the final product",
    body: [
      "DavaDesk is still being built and improved every week. During early access:",
      {
        list: [
          "you may find bugs, errors, slow screens or features that don't work as expected;",
          "features may change, move, be renamed, or be added and removed without notice;",
          "the service may occasionally be unavailable for updates or maintenance;",
          "AI results (scanned invoices, packs, suggestions and answers) can be wrong, so always check them before saving.",
        ],
      },
      "Please check bills, GST amounts, stock and payments before you rely on them, and keep your own copies of important records (DavaDesk lets you export and print them).",
    ],
  },
  {
    id: "report",
    title: "Reporting bugs and getting help",
    body: [
      "If something doesn't work, open Help & Support from your profile menu and tell us what happened: what you were doing, what you expected, and a screenshot if you can. You'll get replies in the app.",
      "We aim to reply within one working day and to fix serious problems (anything that stops billing or risks your data) as a priority.",
    ],
  },
  {
    id: "activity",
    title: `Keep your account active (${INACTIVE_DAYS}-day rule)`,
    body: [
      "Early access seats are limited and other pharmacies are waiting for one. We expect you to use DavaDesk in your day-to-day work.",
      {
        list: [
          `If nobody in your pharmacy signs in or uses DavaDesk for ${INACTIVE_DAYS} days in a row, we may end your early access and give the seat to the next pharmacy in the queue.`,
          "Where we can, we'll remind you by email or in the app before that happens.",
          "If your access ends this way, your data is kept for 30 days. Write to us through Help & Support within that time if you want to continue or take your data with you.",
        ],
      },
    ],
  },
  {
    id: "partner",
    title: "Feedback and the DavaDesk Partner badge",
    body: [
      "Your feedback shapes DavaDesk. Send ideas, suggestions and problems any time through Help & Support.",
      {
        list: [
          "When we build a feature or an improvement from your idea or feedback, your pharmacy is recognised as a DavaDesk Partner and receives the Partner badge.",
          "With your permission, we'll mention you alongside that feature, for example in our release notes.",
          "We decide which ideas to build and when. Sending feedback doesn't oblige us to use it, and you're free to send as much as you like.",
          "You allow us to use your feedback to improve DavaDesk without paying for it or owing you anything beyond the recognition above.",
        ],
      },
    ],
  },
  {
    id: "credits",
    title: "AI features and fair use",
    body: [
      "AI features use AI credits shared by everyone in your pharmacy. This covers DavaDesk AI (the assistant), scanning supplier invoices and medicine packs, scanning to bill, and voice. Your balance is shown at the top of the app.",
      {
        list: [
          "Each use is charged by how much AI work it needed; repeat scans of the same photo shortly afterwards aren't charged again.",
          "Your plan may include daily credits that refresh every day. You can also buy credits; bought credits don't expire.",
          "When your credits run out, AI features pause until they refresh or you add more. The rest of DavaDesk keeps working.",
          "AI use isn't unlimited. Automated or bulk requests, scraping data out of DavaDesk, or reselling access aren't allowed, and we may limit or stop accounts that do this.",
        ],
      },
    ],
  },
  {
    id: "data",
    title: "Your data",
    body: [
      "The records you enter (stock, purchases, bills, customers, suppliers and so on) belong to you. We store and process them only to run DavaDesk for you.",
      {
        list: [
          "Your data is stored on secured servers in India and backed up every day.",
          "We never sell your data. Our team looks at your account only to help you, such as when you ask for support.",
          "You're responsible for having your customers' permission to store their details (such as names, phone numbers and purchase history) and for using them lawfully, including under the Digital Personal Data Protection Act, 2023.",
        ],
      },
    ],
  },
  {
    id: "responsibilities",
    title: "Your responsibilities",
    body: [
      {
        list: [
          "Give correct details for your pharmacy, including licence and GST numbers.",
          "Follow the laws that apply to your pharmacy, including the Drugs and Cosmetics Act and rules, prescription and scheduled-drug requirements, and GST. DavaDesk helps with records; the professional and legal responsibility stays with you.",
          "Keep your password and sign-in codes private, and give staff their own logins. You're responsible for what happens under your account.",
          "Early access codes are personal to your pharmacy. Don't share, sell or publish them.",
          "Don't misuse DavaDesk: no attempts to break in, disrupt the service, or access other pharmacies' data.",
        ],
      },
    ],
  },
  {
    id: "after",
    title: "When early access ends",
    body: [
      "Your early access ends on the date shown in the app. Before then, we'll announce our plans and prices so you can choose one and carry on with all your data in place.",
      "If you don't choose a plan, access to DavaDesk pauses when early access ends. We keep your data for 30 days so you can pick up where you left off, after which it may be deleted.",
    ],
  },
  {
    id: "changes",
    title: "Changes to early access",
    body: [
      "We may change these terms, change the early access programme, or end it. We'll tell you in the app or by email; important changes will ask you to accept the terms again.",
      "We may end early access for any account that breaks these terms or misuses DavaDesk.",
    ],
  },
  {
    id: "liability",
    title: "No warranty and limits of liability",
    body: [
      "Early access is provided free and as it is, while DavaDesk is still being developed. We'll take reasonable care, but we don't promise it will be error-free or always available.",
      "As far as the law allows, we aren't responsible for indirect or consequential losses, such as lost profits or business, that come from using early access. Nothing in these terms limits rights you have by law that can't be limited.",
    ],
  },
  {
    id: "law",
    title: "Governing law and contact",
    body: [
      "These terms are governed by the laws of India.",
      "Questions about these terms? Ask us through Help & Support in the app.",
    ],
  },
];

export default function EarlyAccessTermsPage() {
  const { user, loading, logout, fetchUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = "Early Access Terms - DavaDesk";
    window.scrollTo(0, 0); // arriving from the plans page, which may be scrolled
  }, []);

  if (loading) return <Loader fullScreen text="Loading..." />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  const accepted = (user.early_access_terms?.version || 0) >= EARLY_ACCESS_TERMS_VERSION;
  const sub = user.subscription;

  const accept = async () => {
    setSaving(true);
    try {
      await axios.post(`${API}/users/me/early-access-terms`, { version: EARLY_ACCESS_TERMS_VERSION });
      await fetchUser();
      toast.success("Welcome to DavaDesk early access!");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Couldn't save. Please try again.");
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground" data-testid="early-access-terms">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(249,115,22,0.16),transparent)]" />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pt-6 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <img src="/assets/svgs/logoBrand/logoOnlyWithoutBackground.svg" alt="DavaDesk" className="h-10 w-10 shrink-0" />
          <div className="min-w-0">
            <p className="font-extrabold leading-tight">DavaDesk</p>
            <p className="truncate text-xs font-semibold text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {accepted && (
            <Button variant="outline" className="rounded-full max-md:px-3" onClick={() => navigate("/dashboard")} aria-label="Dashboard">
              <ArrowLeft className="mr-1.5 h-4 w-4 max-md:mr-0" />
              <span className="max-md:hidden">Dashboard</span>
            </Button>
          )}
          <ThemeToggle />
          <Button
            variant="ghost"
            className="rounded-full max-md:px-3"
            aria-label="Logout"
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
          >
            <LogOut className="mr-1.5 h-4 w-4 max-md:mr-0" />
            <span className="max-md:hidden">Logout</span>
          </Button>
        </div>
      </header>

      <main className={`relative z-10 mx-auto max-w-6xl px-4 sm:px-6 ${accepted ? "pb-16" : "pb-40"}`}>
        <section className="mx-auto max-w-3xl pb-8 pt-10 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-extrabold text-orange-600 dark:text-orange-400">
            <Sparkles className="h-3.5 w-3.5" /> You're in: DavaDesk early access
          </span>
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Early Access Terms</h1>
          <p className="mt-3 text-base font-medium text-muted-foreground">
            Thank you for helping us build DavaDesk. Please read these terms before you start{sub?.ends_at ? `. Your early access runs until ${fmtDate(sub.ends_at)}` : ""}.
          </p>
          <p className="mt-2 text-xs font-semibold text-muted-foreground">
            Version {EARLY_ACCESS_TERMS_VERSION} · effective {EFFECTIVE}
          </p>
        </section>

        {/* The four things that matter most */}
        <section className="mx-auto grid max-w-5xl gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Key points">
          {HIGHLIGHTS.map(({ icon: Icon, tone, title, text }) => (
            <div key={title} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${tone} text-white shadow-md`}>
                <Icon className="h-5 w-5" />
              </span>
              <h2 className="mt-3 text-sm font-black leading-snug">{title}</h2>
              <p className="mt-1 text-xs font-medium leading-relaxed text-muted-foreground">{text}</p>
            </div>
          ))}
        </section>

        <div className="mx-auto mt-10 grid max-w-5xl gap-8 lg:grid-cols-[220px_1fr]">
          {/* Contents (desktop) */}
          <nav aria-label="Contents" className="hidden lg:block">
            <div className="sticky top-6 rounded-2xl border border-border bg-card p-4">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                <FileText className="h-3.5 w-3.5" /> Contents
              </p>
              <ol className="space-y-1.5 text-xs font-semibold">
                {SECTIONS.map((s, i) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="flex gap-2 rounded-lg px-1.5 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                      <span className="tabular-nums text-orange-500">{i + 1}.</span>
                      {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>

          <article className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
            {SECTIONS.map((s, i) => (
              <section key={s.id} id={s.id} className="scroll-mt-6 border-b border-border/60 py-6 first:pt-0 last:border-0 last:pb-0">
                <h2 className="flex items-baseline gap-2 text-lg font-black tracking-tight">
                  <span className="tabular-nums text-orange-500">{i + 1}.</span>
                  {s.title}
                </h2>
                <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
                  {s.body.map((b, j) =>
                    typeof b === "string" ? (
                      <p key={j}>{b}</p>
                    ) : (
                      <ul key={j} className="space-y-2">
                        {b.list.map((li) => (
                          <li key={li} className="flex gap-2.5">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                            <span>{li}</span>
                          </li>
                        ))}
                      </ul>
                    )
                  )}
                </div>
              </section>
            ))}
          </article>
        </div>

        {accepted && (
          <p className="mx-auto mt-6 flex max-w-5xl items-center justify-center gap-2 text-sm font-bold text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="h-4 w-4" /> You accepted these terms on {fmtDate(user.early_access_terms.accepted_at)}.
          </p>
        )}
      </main>

      {!accepted && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
          <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <label className="flex cursor-pointer items-start gap-3 text-sm font-semibold">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-orange-500"
                data-testid="terms-agree"
              />
              <span>I've read and agree to the DavaDesk Early Access Terms, including the {INACTIVE_DAYS}-day activity rule and AI credit use.</span>
            </label>
            <Button
              onClick={accept}
              disabled={!agreed || saving}
              className="h-12 shrink-0 rounded-xl px-6 font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 shadow-lg shadow-orange-500/25 disabled:opacity-50"
              data-testid="terms-accept"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                <>
                  <Check className="mr-1.5 h-4 w-4" /> Accept and start
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
