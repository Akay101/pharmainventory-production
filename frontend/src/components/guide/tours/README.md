# Guided tours

Narrated, cinematic walkthroughs that run on the real pages with demo data.

- `GuideProvider.jsx`: context (`useGuide().start(id)`, `openHub()`), the tours hub, `<GuideButton tour="…" />` for page headers, and `<GuideOutlet />`, which lets a tour remount the page in and out of demo mode.
- `engine/runner.js`: plays the beats in order. Going back or jumping to a chapter rebuilds the demo page and replays earlier beats' actions at full speed, so the page is always in the state a beat expects.
- `engine/Stage.jsx`, `engine/Graphics.jsx`: the focus iris, magnifier, travelling orb, chapter cards and motion graphics.
- `engine/Director.jsx`: language choice, the presenter bar (captions and controls) and the end screen.
- `engine/narration.js`: plays recorded audio, or shows timed captions when a line has no up-to-date recording.
- `sandbox/`: demo-data mode. Module endpoints are answered from an in-memory demo pharmacy, other reads pass through, and other writes are swallowed. localStorage writes go to a throwaway overlay. `window.open`, `print` and non-GET `fetch` are stubbed.

## A tour file

Add `tours/<id>.js`, register it in `tours/index.js`, put `<GuideButton tour="<id>" />` in the page header, and teach the sandbox that module's endpoints (`sandbox/sandbox.js` `route()`, demo rows in `sandbox/demoData.js`).

A tour file has **no imports**, because the audio script reads it on its own. Local helper functions are fine.

```js
export default {
  id: "billing",
  route: "/billing",                       // page the tour runs on
  ready: '[data-testid="new-bill-btn"]',   // shown once the page has loaded
  clearKeys: ["pharmalogy_billing_drafts_*"], // storage the page should see as empty
  title: { en: "Billing", hi: "बिलिंग" },
  next: "purchases",                       // offered on the end screen
  outro: { en: "…", hi: "…" },
  chapters: [
    { id: "page", title: { en: "…", hi: "…" }, beats: [ /* … */ ] },
  ],
};
```

### Beats

| field | meaning |
| --- | --- |
| `id` | unique in the tour; also the audio file name |
| `say` | `{ en, hi }`, what the assistant says |
| `focus` | target to light up; `null` lights nothing; `[{ union: a }, { union: b }]` frames several |
| `look` | `"spot"` (default), `"wide"` (lighter dim), `"loupe"` (also magnify), `"stage"` (no dim) |
| `fx` | graphic(s) to play, see `engine/Graphics.jsx` (chips, equation, split, stamp, count, flow, scan, receipt, keys, rings, title) |
| `before` | actions before the line starts (also replayed on fast-forward) |
| `during` | actions while the line plays (they start after `delay`, 500 ms by default) |
| `after` | actions after the line ends |
| `hold` | pause after the beat, in ms |
| `optional` | skip when the focus (or this target) isn't on the page |
| `phone` / `desktop` | overrides for that screen size, e.g. `phone: { skip: true }` |
| `keepFx` | keep the previous beat's graphics |

### Targets

A CSS selector, or `{ sel, text, exact, nth, last, closest, within }`. `text` picks the innermost visible element containing that text. Prefer `data-testid` or `data-guide="…"` attributes: they don't change how anything looks.

### Actions

`{ click }`, `{ type, into }`, `{ select, trigger }` (Radix select), `{ check: true|false, target }` (checkbox), `{ key, on? }`, `{ wait }`, `{ gone }`, `{ pause: ms }`, `{ scroll }`, `{ scrollTop: true }`, `{ blur: true }`, `{ navigate }`, `{ focusOn, look? }` (move the light mid-beat), `{ fx }`, `{ clearFx: true }`, `{ run: async ({ find, waitFor, click, type }) => … }`.

The orb flies to whatever it clicks or types into, so the viewer sees each action happen.

## Narration audio

Record new or changed lines (both languages) in the assistant's voice:

```bash
cd backend-node && node scripts/build-guide-audio.js billing
```

It writes `frontend/public/guide-audio/<lang>/<tour>/<beat>.m4a` plus `manifest.json`, and skips lines whose text hasn't changed. It needs `GEMINI_API_KEY`, or `GOOGLE_TTS_API_KEY` for Cloud TTS (a steadier voice and a separate quota). A line with no matching recording plays as captions only.
