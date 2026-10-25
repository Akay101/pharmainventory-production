// Keyboard shortcut combos: parsing, matching a KeyboardEvent, and showing
// them the way each OS writes them (⌥ ⇧ ⌘ on Mac, Alt / Shift / Ctrl elsewhere).
//
// A combo is a string like "alt+n", "mod+enter", "alt+,", "?" or "escape".
// "mod" is ⌘ on Mac and Ctrl elsewhere. Letters and digits are matched by
// physical key (event.code), so ⌥ on Mac (which types special characters)
// and other keyboard layouts work the same.
//
// Firefox on Windows/Linux opens its menu bar on Alt+letter, so there every
// Alt shortcut also works (and is shown) as Alt+Shift+letter.

const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
const platform = typeof navigator !== "undefined" ? navigator.userAgentData?.platform || navigator.platform || "" : "";

export const IS_MAC = /mac|iphone|ipad|ipod/i.test(platform) || /Mac OS X/.test(ua);
export const IS_FIREFOX = /firefox/i.test(ua) && !IS_MAC;
export const IS_TOUCH = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches && !window.matchMedia?.("(any-pointer: fine)").matches;

const CODE_FOR = {
  enter: ["Enter", "NumpadEnter"],
  escape: ["Escape"],
  "/": ["Slash", "NumpadDivide"],
  "?": ["Slash"],
  ",": ["Comma"],
  ".": ["Period"],
  arrowup: ["ArrowUp"],
  arrowdown: ["ArrowDown"],
  delete: ["Delete", "Backspace"],
};

const parsed = new Map();
export function parseCombo(combo) {
  if (parsed.has(combo)) return parsed.get(combo);
  const parts = String(combo).toLowerCase().split("+");
  const key = parts.pop();
  const mods = new Set(parts);
  const p = { alt: mods.has("alt"), mod: mods.has("mod"), shift: mods.has("shift") || key === "?", key };
  parsed.set(combo, p);
  return p;
}

function keyMatches(e, key) {
  if (/^[a-z]$/.test(key)) return e.code === `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return e.code === `Digit${key}` || e.code === `Numpad${key}`;
  const codes = CODE_FOR[key];
  if (codes) return codes.includes(e.code) || (key === "?" && e.key === "?");
  return (e.key || "").toLowerCase() === key;
}

export function matchesCombo(e, combo) {
  const p = parseCombo(combo);
  if (!keyMatches(e, p.key)) return false;
  const mod = IS_MAC ? e.metaKey : e.ctrlKey;
  const otherMod = IS_MAC ? e.ctrlKey : e.metaKey;
  if (otherMod || mod !== p.mod || e.altKey !== p.alt) return false;
  // Firefox: Alt+X is also accepted as Alt+Shift+X
  if (p.alt && !p.shift && IS_FIREFOX) return true;
  return e.shiftKey === p.shift;
}

const MAC_SYMBOL = { alt: "⌥", shift: "⇧", mod: "⌘", enter: "↵", escape: "Esc", arrowup: "↑", arrowdown: "↓", delete: "⌫" };
const WIN_NAME = { alt: "Alt", shift: "Shift", mod: "Ctrl", enter: "Enter", escape: "Esc", arrowup: "↑", arrowdown: "↓", delete: "Del" };

// ["⌥", "N"] / ["Alt", "N"] / ["Alt", "Shift", "N"] (Firefox)
export function comboKeys(combo) {
  const p = parseCombo(combo);
  const names = IS_MAC ? MAC_SYMBOL : WIN_NAME;
  const out = [];
  if (p.mod) out.push(names.mod);
  if (p.alt) out.push(names.alt);
  if ((p.shift && p.key !== "?") || (p.alt && IS_FIREFOX && !p.shift)) out.push(names.shift);
  out.push(names[p.key] || (p.key.length === 1 ? p.key.toUpperCase() : p.key[0].toUpperCase() + p.key.slice(1)));
  return out;
}

// "⌥N" on Mac, "Alt+N" elsewhere
export const formatCombo = (combo) => comboKeys(combo).join(IS_MAC ? "" : "+");

export const isTypingTarget = (el) => {
  if (!el || el === document.body) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  return !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"].includes((el.type || "").toLowerCase());
};

// The open modal on top (Radix dialogs / alert dialogs), if any
export function topModal() {
  const open = document.querySelectorAll('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
  return open.length ? open[open.length - 1] : null;
}

export const isVisible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
