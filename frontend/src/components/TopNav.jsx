import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { formatCombo } from "../lib/shortcuts";

// Desktop top menu that always fits on one line, without scrolling. It
// measures the space it has and picks the roomiest layout that fits:
//   1. every tab with its label
//   2. labels on the first tabs that fit, the rest under "More" (if 7+ fit)
//   3. icons, with the current page's label
//   4. icons, and the tabs that still don't fit go under "More"
const GAP = 2; // px between tabs (gap-0.5)
const PAD = 10; // container padding + border

export default function TopNav({ items, isActive }) {
  const slotRef = useRef(null);
  const measureRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [sizes, setSizes] = useState(null); // { full: [..], icon, more }

  // Natural widths of each tab, from an invisible copy (again once web fonts load)
  useLayoutEffect(() => {
    const measure = () => {
      const m = measureRef.current;
      if (!m) return;
      const kids = [...m.children];
      setSizes({
        full: kids.slice(0, items.length).map((el) => el.offsetWidth),
        icon: kids[items.length]?.offsetWidth || 36,
        more: kids[items.length + 1]?.offsetWidth || 36,
      });
    };
    measure();
    let live = true;
    document.fonts?.ready?.then(() => live && measure());
    return () => {
      live = false;
    };
  }, [items]);

  useLayoutEffect(() => {
    const el = slotRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const activeIndex = items.findIndex((it) => isActive(it.path));

  const layout = useMemo(() => {
    if (!sizes || !width) return { labels: "active", visible: items.map((_, i) => i), hidden: [] };
    const room = width - PAD;
    const sum = (arr) => arr.reduce((a, b) => a + b, 0) + GAP * Math.max(0, arr.length - 1);
    if (sum(sizes.full) <= room) return { labels: "all", visible: items.map((_, i) => i), hidden: [] };
    // Labels on as many tabs as fit (in order, the current page always kept), the rest under More
    {
      const visible = [];
      let used = sizes.more + (activeIndex >= 0 ? sizes.full[activeIndex] + GAP : 0);
      let stopped = false;
      items.forEach((_, i) => {
        if (i === activeIndex) return visible.push(i);
        if (!stopped && used + sizes.full[i] + GAP <= room) {
          visible.push(i);
          used += sizes.full[i] + GAP;
        } else stopped = true;
      });
      if (visible.length >= Math.min(7, items.length - 1)) {
        return { labels: "all", visible, hidden: items.map((_, i) => i).filter((i) => !visible.includes(i)) };
      }
    }
    const iconRow = items.map((_, i) => (i === activeIndex ? sizes.full[i] : sizes.icon));
    if (sum(iconRow) <= room) return { labels: "active", visible: items.map((_, i) => i), hidden: [] };
    // Keep tabs in order until "More" has to take the rest; the current page always stays out
    const visible = [];
    let used = sizes.more + (activeIndex >= 0 ? sizes.full[activeIndex] + GAP : 0);
    items.forEach((_, i) => {
      if (i === activeIndex) return visible.push(i);
      if (used + sizes.icon + GAP <= room) {
        visible.push(i);
        used += sizes.icon + GAP;
      }
    });
    return { labels: "active", visible, hidden: items.map((_, i) => i).filter((i) => !visible.includes(i)) };
  }, [sizes, width, items, activeIndex]);

  const tabClass = (active) =>
    `group relative flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-bold whitespace-nowrap transition-colors duration-200 active:scale-95 ${
      active ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm shadow-orange-500/30" : "text-muted-foreground hover:bg-background hover:text-foreground dark:hover:bg-muted/60"
    }`;

  const navigate = useNavigate();
  const FirstIcon = items[0]?.icon || MoreHorizontal;
  const hiddenActive = layout.hidden.some((i) => i === activeIndex);

  return (
    <div ref={slotRef} className="hidden lg:flex min-w-0 flex-1 justify-center">
      {/* Invisible copy for measuring: every tab with label, one icon-only tab, the More button */}
      <div ref={measureRef} aria-hidden="true" className="pointer-events-none invisible fixed left-0 top-0 flex gap-0.5">
        {items.map((item) => (
          <span key={item.path} className={tabClass(false)}>
            <item.icon className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </span>
        ))}
        <span className={tabClass(false)}>
          <FirstIcon className="h-4 w-4 shrink-0" />
        </span>
        <span className={tabClass(false)}>
          <MoreHorizontal className="h-4 w-4" />
          <span>More</span>
        </span>
      </div>

      <nav aria-label="Main" className="flex max-w-full items-center gap-0.5 rounded-2xl border border-border/60 bg-muted/50 p-1 shadow-xs dark:border-border/40 dark:bg-muted/20">
        {layout.visible.map((i) => {
          const item = items[i];
          const active = i === activeIndex;
          const showLabel = layout.labels === "all" || active;
          return (
            <Tooltip key={item.path}>
              <TooltipTrigger asChild>
                <NavLink
                  to={item.path}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  className={tabClass(active)}
                  data-testid={`nav-${item.path.slice(1)}`}
                  data-kbd={item.shortcut ? formatCombo(item.shortcut) : undefined}
                >
                  <item.icon className={`h-4 w-4 shrink-0 transition-transform duration-200 ${active ? "" : "group-hover:scale-110"}`} />
                  {showLabel && <span>{item.label}</span>}
                </NavLink>
              </TooltipTrigger>
              {!showLabel && (
                <TooltipContent side="bottom" className="text-[11px] font-bold shadow-md">
                  {item.label}
                  {item.shortcut && <span className="ml-1.5 font-mono text-[10px] opacity-70">{formatCombo(item.shortcut)}</span>}
                </TooltipContent>
              )}
            </Tooltip>
          );
        })}
        {layout.hidden.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={tabClass(hiddenActive)} aria-label="More pages">
                <MoreHorizontal className="h-4 w-4" />
                <span>More</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-2xl p-1.5">
              {layout.hidden.map((i) => {
                const item = items[i];
                return (
                  <DropdownMenuItem key={item.path} onClick={() => navigate(item.path)} className="cursor-pointer rounded-xl px-3 py-2 font-bold">
                    <item.icon className="mr-2.5 h-4 w-4 text-orange-500" />
                    <span className="flex-1">{item.label}</span>
                    {item.shortcut && <span className="font-mono text-[10px] text-muted-foreground">{formatCombo(item.shortcut)}</span>}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </nav>
    </div>
  );
}
