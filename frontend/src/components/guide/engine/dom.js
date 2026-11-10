// Finding things on the page and operating them like a person would, so a
// tour drives the real UI (React state, dropdowns, Radix menus) end to end.

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const isPhone = () => window.matchMedia("(max-width: 767px)").matches;

const visible = (el) => {
  if (!el || !el.isConnected) return false;
  if (el.closest("[data-guide-layer]")) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.02;
};

const TEXT_TAGS = "button,label,span,div,th,td,p,h1,h2,h3,h4,a,[role=option],[role=menuitem],li";

// A target is a CSS selector, or { sel, text, exact, nth, last, closest, within }
// - text: element whose own text contains this (smallest such element wins)
// - closest: climb from the match to this ancestor selector
// - within: search inside the first match of this target
export function find(spec, root = document) {
  if (!spec) return null;
  if (Array.isArray(spec)) {
    for (const s of spec) {
      const el = find(s, root);
      if (el) return el;
    }
    return null;
  }
  if (typeof spec === "string") spec = { sel: spec };
  if (spec.within) {
    const r = find(spec.within, root);
    if (!r) return null;
    root = r;
  }
  let list = [...root.querySelectorAll(spec.sel || TEXT_TAGS)].filter(visible);
  if (spec.text) {
    const want = String(spec.text).toLowerCase().replace(/\s+/g, " ").trim();
    list = list.filter((el) => {
      const t = (el.innerText || el.textContent || "").toLowerCase().replace(/\s+/g, " ").trim();
      return spec.exact ? t === want : t.includes(want);
    });
    // Keep the innermost matches (a button, not the whole page around it)
    list = list.filter((el) => !list.some((o) => o !== el && el.contains(o)));
  }
  let el = spec.last ? list[list.length - 1] : list[spec.nth || 0];
  if (el && spec.closest) el = el.closest(spec.closest) || el;
  return el || null;
}

export function rectOf(spec) {
  const specs = Array.isArray(spec) && spec.some((s) => s && typeof s === "object" && s.union) ? spec : null;
  if (specs) {
    const rects = specs.map((s) => find(s.union)).filter(Boolean).map((e) => e.getBoundingClientRect());
    return union(rects);
  }
  const el = find(spec);
  return el ? el.getBoundingClientRect() : null;
}

export function union(rects) {
  if (!rects.length) return null;
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.right));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  return { left, top, right, bottom, width: right - left, height: bottom - top, x: left, y: top };
}

export async function waitFor(spec, { timeout = 6000, gone = false } = {}) {
  const t0 = performance.now();
  for (;;) {
    const el = find(spec);
    if (gone ? !el : el) return el;
    if (performance.now() - t0 > timeout) throw new Error(`Timed out waiting for ${JSON.stringify(spec)}`);
    await sleep(80);
  }
}

const center = (el) => {
  const r = el.getBoundingClientRect();
  return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
};

// Full pointer + mouse + click sequence (Radix opens menus on pointerdown,
// our dropdown rows pick on mousedown, buttons on click)
export function click(el) {
  const pos = center(el);
  const base = { bubbles: true, cancelable: true, composed: true, view: window, button: 0, ...pos };
  const P = window.PointerEvent || MouseEvent;
  el.dispatchEvent(new P("pointerover", { ...base, pointerType: "mouse", isPrimary: true }));
  el.dispatchEvent(new P("pointerdown", { ...base, pointerType: "mouse", isPrimary: true, buttons: 1 }));
  el.dispatchEvent(new MouseEvent("mousedown", { ...base, buttons: 1 }));
  if (typeof el.focus === "function" && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName)) el.focus({ preventScroll: true });
  el.dispatchEvent(new P("pointerup", { ...base, pointerType: "mouse", isPrimary: true }));
  el.dispatchEvent(new MouseEvent("mouseup", base));
  el.dispatchEvent(new MouseEvent("click", base));
}

function setNativeValue(el, value) {
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

// Types into an input one character at a time (React sees every keystroke)
export async function typeInto(el, text, { clear = true, cps = 14, fast = false, gate } = {}) {
  el.focus({ preventScroll: true });
  if (el.type === "date" || el.type === "number" || fast) {
    setNativeValue(el, String(text));
    return;
  }
  let v = clear ? "" : el.value || "";
  if (clear && el.value) setNativeValue(el, "");
  for (const ch of String(text)) {
    if (gate) await gate();
    v += ch;
    el.dispatchEvent(new KeyboardEvent("keydown", { key: ch, bubbles: true }));
    setNativeValue(el, v);
    el.dispatchEvent(new KeyboardEvent("keyup", { key: ch, bubbles: true }));
    await sleep(1000 / cps + Math.random() * 40);
  }
}

export function pressKey(el, key) {
  const target = el || document.activeElement || document.body;
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  target.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
}

export function scrollIntoViewIfNeeded(el, { margin = 120 } = {}) {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  if (r.top < margin || r.bottom > vh - margin * 1.6) {
    el.scrollIntoView({ block: r.height > vh * 0.5 ? "start" : "center", behavior: "smooth" });
    return true;
  }
  return false;
}

// Radix checkbox / switch state
export const isChecked = (el) => el.getAttribute("aria-checked") === "true" || el.dataset.state === "checked" || el.checked === true;
