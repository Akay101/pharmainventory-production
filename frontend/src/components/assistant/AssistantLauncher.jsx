import { useNavigate } from "react-router-dom";
import { AI_LOGO_SRC } from "../scan/ScanUI";
import { formatCombo } from "../../lib/shortcuts";

// Floating button that opens the full-screen assistant (also Alt/⌥ + J, a
// global shortcut in DashboardLayout; Ctrl/⌘ + J is the browser's Downloads)
export default function AssistantLauncher() {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate("/assistant")}
      title={`DavaDesk AI (${formatCombo("alt+j")})`}
      data-kbd={formatCombo("alt+j")}
      aria-label="Open DavaDesk AI"
      className="group fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-full bg-card p-1 pr-1 shadow-xl shadow-indigo-500/20 ring-1 ring-border transition-all hover:pr-4 sm:bottom-6 sm:right-6"
    >
      <span className="relative flex h-12 w-12 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-gradient-to-br from-orange-500/30 to-violet-500/30 [animation-duration:2.5s]" />
        <img src={AI_LOGO_SRC} alt="" className="relative h-12 w-12 rounded-full" />
      </span>
      <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold transition-all duration-300 group-hover:max-w-[120px]">Ask DavaDesk AI</span>
    </button>
  );
}
