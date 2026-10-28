import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Search, X } from "lucide-react";
import { comboKeys, formatCombo, IS_MAC, IS_TOUCH, isTypingTarget, isVisible, matchesCombo, topModal } from "../../lib/shortcuts";

// One keyboard layer for the whole app, so shortcuts never fight:
//   1. an open dialog: ⌘/Ctrl+Enter (or Alt+Enter) presses its Save button; Esc closes it
//   2. the page's shortcuts (useShortcuts), newest first
//   3. global shortcuts (navigation, search, help)
// A binding whose run() returns false lets the next one have the key.
//
// Tables: rows marked data-row inside data-rows move with ↑ ↓ Home End; Enter
// opens a row; a button in the row with data-row-key="w" is pressed by W.
// Hold Alt (⌥) to see the shortcut of every button marked data-kbd.

const Ctx = createContext(null);
export const useShortcutLayer = () => useContext(Ctx);

export function Kbd({ combo, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      {comboKeys(combo).map((k, i) => (
        <kbd key={i} className="min-w-[1.4rem] rounded-md border border-border bg-muted px-1.5 py-0.5 text-center font-mono text-[10px] font-bold leading-none text-foreground shadow-[0_1px_0_hsl(var(--border))]">
          {k}
        </kbd>
      ))}
    </span>
  );
}

/**
 * Page shortcuts, active while the component is mounted.
 * bindings: [{ combo, label, group?, run(e) => false|void, when?() => bool, inInputs?: bool, hidden?: bool, save?: bool }]
 * Save keys (⌘/Ctrl+Enter, Alt+S, Alt+U, or save: true) first commit the field being typed in.
 * The latest bindings are always used (no deps needed).
 */
export function useShortcuts(bindings, scopeName = "This page") {
  const layer = useContext(Ctx);
  const ref = useRef(bindings);
  ref.current = bindings;
  useEffect(() => {
    if (!layer) return undefined;
    return layer.register(scopeName, ref);
  }, [layer, scopeName]);
}

function clickIn(root, selector) {
  const el = [...root.querySelectorAll(selector)].find((b) => isVisible(b) && !b.disabled && b.getAttribute("aria-disabled") !== "true");
  if (!el) return false;
  commitFieldThen(() => el.click());
  return true;
}

// Save keys pressed while still typing in a field (e.g. a new Grand Total):
// leave the field first so its onBlur applies the value, then save on the next
// tick, after React has re-rendered with it. Otherwise the save sends the old value.
const SAVE_COMBOS = new Set(["mod+enter", "alt+enter", "alt+s", "alt+u"]);
function commitFieldThen(fn) {
  const el = document.activeElement;
  if (!isTypingTarget(el)) return fn();
  el.blur();
  setTimeout(fn, 0);
  return undefined;
}

// Keys for focused table rows
function handleRowKeys(e) {
  const row = e.target.closest?.("[data-row]");
  const list = row?.closest("[data-rows]");
  if (!row || !list) return false;
  if (e.altKey || e.ctrlKey || e.metaKey) return false;
  const rows = [...list.querySelectorAll("[data-row]")].filter(isVisible);
  const i = rows.indexOf(row);
  const go = (n) => {
    const r = rows[Math.max(0, Math.min(rows.length - 1, n))];
    r?.focus();
    r?.scrollIntoView({ block: "nearest" });
    return true;
  };
  if (e.target !== row) return false; // a button inside the row has focus
  if (e.key === "ArrowDown") return go(i + 1);
  if (e.key === "ArrowUp") return go(i - 1);
  if (e.key === "Home") return go(0);
  if (e.key === "End") return go(rows.length - 1);
  if (e.key === "Enter") {
    row.click();
    return true;
  }
  const key = e.key === "Delete" || e.key === "Backspace" ? "delete" : e.key.length === 1 ? e.key.toLowerCase() : null;
  return key ? clickIn(row, `[data-row-key="${key}"]`) : false;
}

const GROUP_ORDER = ["This page", "Forms & dialogs", "Lists", "Go to", "Anywhere"];

function HelpPanel({ open, onClose, sections }) {
  const [q, setQ] = useState("");
  const inputRef = useRef(null);
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
    else setQ("");
  }, [open]);
  if (!open) return null;
  const query = q.trim().toLowerCase();
  const shown = sections
    .map(([group, items]) => [group, items.filter((it) => !query || `${it.label} ${formatCombo(it.combo)}`.toLowerCase().includes(query))])
    .filter(([, items]) => items.length);
  return (
    <aside
      role="complementary"
      aria-label="Keyboard shortcuts"
      className="fixed bottom-24 right-4 top-20 z-[99980] flex w-[340px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-background/95 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-right-4 duration-200"
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-black">
          <Keyboard className="h-4 w-4 text-orange-500" /> Keyboard shortcuts
        </p>
        <button type="button" onClick={onClose} aria-label="Close shortcuts" className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="border-b border-border p-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a shortcut…" className="h-8 w-full rounded-lg border border-border bg-background pl-8 pr-2 text-xs outline-none focus:border-orange-500/60" />
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {shown.map(([group, items]) => (
          <section key={group}>
            <h3 className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">{group}</h3>
            <ul className="space-y-1">
              {items.map((it) => (
                <li key={`${group}-${it.combo}-${it.label}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1 text-xs hover:bg-muted/50">
                  <span className="text-foreground/90">{it.label}</span>
                  <Kbd combo={it.combo} />
                </li>
              ))}
            </ul>
          </section>
        ))}
        {!shown.length && <p className="text-center text-xs text-muted-foreground">No shortcut matches.</p>}
      </div>
      <p className="border-t border-border px-4 py-2 text-[10px] leading-relaxed text-muted-foreground">
        Hold <kbd className="rounded border border-border bg-muted px-1 font-mono font-bold">{IS_MAC ? "⌥" : "Alt"}</kbd> to see the shortcut on each button. Press <Kbd combo="?" /> any time.
      </p>
    </aside>
  );
}

// Static rows for the help panel (handled by the layer itself, not a binding)
const BUILT_IN = [
  { group: "Forms & dialogs", combo: "mod+enter", label: "Save / confirm" },
  { group: "Forms & dialogs", combo: "escape", label: "Close a dialog or popup" },
  { group: "Forms & dialogs", combo: "enter", label: "Next field (bill and purchase lines)" },
  { group: "Lists", combo: "arrowdown", label: "Next row (focus a row with Tab first)" },
  { group: "Lists", combo: "arrowup", label: "Previous row" },
  { group: "Lists", combo: "enter", label: "Open the row" },
  { group: "Lists", combo: "w", label: "Row action: the letter in a button's tooltip (W WhatsApp, P PDF, E edit…)" },
  { group: "Anywhere", combo: "?", label: "Show or hide shortcuts" },
  { group: "Anywhere", combo: "alt+/", label: "Show or hide shortcuts (while typing)" },
];

export function ShortcutProvider({ children, globals = [] }) {
  const scopes = useRef([]); // [{ id, name, ref }]
  const globalsRef = useRef(globals);
  globalsRef.current = globals;
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef(false);
  helpRef.current = helpOpen;
  const [, bump] = useState(0);

  const register = useCallback((name, ref) => {
    const entry = { id: Math.random().toString(36).slice(2), name, ref };
    scopes.current = [...scopes.current, entry];
    bump((n) => n + 1);
    return () => {
      scopes.current = scopes.current.filter((s) => s !== entry);
      bump((n) => n + 1);
    };
  }, []);

  const toggleHelp = useCallback((v) => setHelpOpen((o) => (typeof v === "boolean" ? v : !o)), []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
      if (helpRef.current && e.key === "Escape") {
        setHelpOpen(false);
        e.preventDefault();
        return;
      }

      // 1. An open dialog owns the keyboard (except its own Save)
      const modal = topModal();
      if (modal) {
        if (matchesCombo(e, "mod+enter") || matchesCombo(e, "alt+enter") || matchesCombo(e, "alt+s")) {
          if (clickIn(modal, '[data-shortcut="save"]') || clickIn(modal, 'button[type="submit"]')) {
            e.preventDefault();
            e.stopPropagation();
          }
        }
        return;
      }

      const typing = isTypingTarget(e.target);
      if (matchesCombo(e, "alt+/") || (!typing && matchesCombo(e, "?"))) {
        e.preventDefault();
        setHelpOpen((o) => !o);
        return;
      }
      if (!typing && handleRowKeys(e)) {
        e.preventDefault();
        return;
      }

      // 2. page scopes (newest first), 3. globals
      const layers = [...scopes.current].reverse().map((s) => s.ref);
      layers.push(globalsRef);
      for (const layerRef of layers) {
        for (const b of layerRef.current || []) {
          if (!b || !matchesCombo(e, b.combo)) continue;
          const p = b.combo.toLowerCase();
          const modified = p.includes("alt+") || p.includes("mod+");
          if (typing && !modified && !b.inInputs) continue;
          if (b.when && !b.when()) continue;
          if (typing && (b.save || SAVE_COMBOS.has(p))) {
            // Run the binding from the next render, which has the committed value
            commitFieldThen(() => ((layerRef.current || []).find((x) => x?.combo === b.combo) || b).run(e));
          } else if (b.run(e) === false) continue;
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // Hold Alt (⌥) alone: show shortcut badges on buttons (data-kbd)
  useEffect(() => {
    if (IS_TOUCH) return undefined;
    let timer = null;
    const root = document.documentElement;
    const hide = () => {
      clearTimeout(timer);
      root.classList.remove("kbd-hints");
    };
    const down = (e) => {
      if (e.key === "Alt" && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        clearTimeout(timer);
        timer = setTimeout(() => root.classList.add("kbd-hints"), 450);
      } else hide();
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", hide, true);
    window.addEventListener("blur", hide);
    document.addEventListener("pointerdown", hide, true);
    return () => {
      hide();
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", hide, true);
      window.removeEventListener("blur", hide);
      document.removeEventListener("pointerdown", hide, true);
    };
  }, []);

  const sections = useMemo(() => {
    const rows = [];
    for (const s of scopes.current) for (const b of s.ref.current || []) if (b && !b.hidden && b.label) rows.push({ group: b.group || "This page", combo: b.combo, label: b.label });
    for (const b of globals) if (b && !b.hidden && b.label) rows.push({ group: b.group || "Anywhere", combo: b.combo, label: b.label });
    rows.push(...BUILT_IN);
    const by = new Map();
    for (const r of rows) {
      const list = by.get(r.group) || [];
      if (!list.some((x) => x.combo === r.combo && x.label === r.label)) list.push(r);
      by.set(r.group, list);
    }
    const rank = (g) => (GROUP_ORDER.indexOf(g) < 0 ? 99 : GROUP_ORDER.indexOf(g));
    return [...by.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
    // eslint-disable-next-line
  }, [helpOpen, globals]);

  const value = useMemo(() => ({ register, toggleHelp, helpOpen }), [register, toggleHelp, helpOpen]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} sections={sections} />
    </Ctx.Provider>
  );
}
