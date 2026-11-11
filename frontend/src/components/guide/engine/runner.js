import { click, find, isChecked, isPhone, pressKey, scrollIntoViewIfNeeded, sleep, typeInto, waitFor } from "./dom";
import { pauseSpeaking, preload, resumeSpeaking, setSpeakingRate, speak, stopSpeaking } from "./narration";

// Plays a tour: chapters of beats. A beat says something (in the chosen
// language) while it focuses part of the real page, shows graphics and
// drives the UI with actions. See tours/README.md for the format.
//
// Going back (or jumping to a chapter) resets the demo page and replays the
// earlier beats' actions at full speed with no narration, so the page is
// always in exactly the state that beat expects.

class Cancelled extends Error {}

export function flatten(tour) {
  const beats = [];
  tour.chapters.forEach((ch, ci) => {
    ch.beats.forEach((b, bi) => beats.push({ ...b, chapterIndex: ci, chapter: ch, firstInChapter: bi === 0 }));
  });
  return beats;
}

const variant = (b) => {
  const v = isPhone() ? b.phone : b.desktop;
  return v ? { ...b, ...v } : b;
};

export class Runner {
  constructor({ tour, lang, env, onState }) {
    this.tour = tour;
    this.lang = lang;
    this.env = env; // { resetStage(): Promise, navigate(path) }
    this.onState = onState;
    this.beats = flatten(tour);
    this.token = 0;
    this.rate = 1;
    this.paused = false;
    this.fast = false;
    this.skipping = false;
    this.recovered = -1;
    this.state = { index: 0, focus: null, look: "spot", fx: [], caption: "", progress: 0, card: null, cursor: null, paused: false, status: "playing", error: null };
  }

  set(patch) {
    this.state = { ...this.state, ...patch };
    this.onState(this.state);
  }

  alive(token) {
    if (token !== this.token) throw new Cancelled();
  }

  async gate(token) {
    while (this.paused) {
      this.alive(token);
      await sleep(100);
    }
    this.alive(token);
  }

  async wait(ms, token) {
    if (this.fast || this.skipping) {
      // Even at full speed, give the page a moment to react (focus moves,
      // dropdowns open)
      await sleep(Math.min(ms, 120));
      return this.alive(token);
    }
    const end = performance.now() + ms / this.rate;
    while (performance.now() < end) {
      await this.gate(token);
      await sleep(Math.min(60, end - performance.now()));
    }
    this.alive(token);
  }

  // The orb travels to an element before it operates it
  async cursorTo(el, token, { press = false } = {}) {
    if (this.fast || this.skipping || !el) return;
    const r = el.getBoundingClientRect();
    this.set({ cursor: { x: r.left + Math.min(r.width - 14, r.width * 0.72), y: r.top + r.height / 2, press: false, t: Date.now() } });
    await this.wait(520, token);
    if (press) {
      this.set({ cursor: { ...this.state.cursor, press: true, t: Date.now() } });
      await this.wait(160, token);
    }
  }

  async act(a, token) {
    await this.gate(token);
    const quick = this.fast || this.skipping;
    if (a.pause) return this.wait(a.pause, token);
    if (a.wait) {
      await waitFor(a.wait, { timeout: a.timeout || 8000 });
      return this.alive(token);
    }
    if (a.gone) {
      await waitFor(a.gone, { gone: true, timeout: a.timeout || 8000 });
      return this.alive(token);
    }
    if (a.navigate) {
      this.env.navigate(a.navigate);
      return this.wait(400, token);
    }
    if (a.scrollTop) {
      window.scrollTo({ top: 0, behavior: quick ? "auto" : "smooth" });
      return this.wait(400, token);
    }
    if (a.scroll) {
      const el = await waitFor(a.scroll, { timeout: a.timeout || 8000 });
      el.scrollIntoView({ block: a.block || "center", behavior: quick ? "auto" : "smooth" });
      return this.wait(450, token);
    }
    if (a.blur) {
      document.activeElement?.blur?.();
      return;
    }
    if (a.key) {
      const el = a.on ? await waitFor(a.on) : document.activeElement;
      pressKey(el, a.key);
      return this.wait(a.after ?? 250, token);
    }
    if (a.run) {
      await a.run({ find, waitFor, click, quick, type: (el, text) => typeInto(el, text, { fast: true }) });
      return this.alive(token);
    }
    if (a.focusOn) {
      this.set({ focus: a.focusOn, look: a.look || this.state.look });
      return this.wait(350, token);
    }
    if (a.fx) {
      if (!quick) this.set({ fx: [...this.state.fx, ...(Array.isArray(a.fx) ? a.fx : [a.fx]).map((f) => ({ ...f, key: `${Math.random()}` }))] });
      return;
    }
    if (a.clearFx) {
      this.set({ fx: [] });
      return;
    }
    if (a.click) {
      const el = await waitFor(a.click, { timeout: a.timeout || 8000 });
      this.alive(token);
      if (scrollIntoViewIfNeeded(el)) await this.wait(380, token);
      await this.cursorTo(el, token, { press: true });
      click(el);
      return this.wait(a.after ?? 380, token);
    }
    if (a.check !== undefined) {
      const el = await waitFor(a.target, { timeout: a.timeout || 8000 });
      if (isChecked(el) !== a.check) {
        await this.cursorTo(el, token, { press: true });
        click(el);
      }
      return this.wait(a.after ?? 300, token);
    }
    if (a.select !== undefined) {
      const trigger = await waitFor(a.trigger, { timeout: a.timeout || 8000 });
      await this.cursorTo(trigger, token, { press: true });
      click(trigger);
      // Radix swallows the first pointer-up after a select opens (so the
      // press that opened it can't pick an item): spend it here
      await sleep(60);
      document.dispatchEvent(new (window.PointerEvent || MouseEvent)("pointerup", { bubbles: true, pointerType: "mouse", isPrimary: true }));
      const opt = await waitFor({ sel: '[role="option"]', text: a.select, exact: a.exact });
      await this.wait(500, token);
      await this.cursorTo(opt, token, { press: true });
      click(opt);
      // Let the menu finish closing before anything else is pressed
      await waitFor('[role="listbox"]', { gone: true, timeout: 3000 }).catch(() => {});
      await sleep(180);
      return this.wait(a.after ?? 350, token);
    }
    if (a.type !== undefined) {
      const el = await waitFor(a.into, { timeout: a.timeout || 8000 });
      this.alive(token);
      if (scrollIntoViewIfNeeded(el)) await this.wait(380, token);
      await this.cursorTo(el, token);
      if (this.state.cursor) this.set({ cursor: { ...this.state.cursor, typing: true } });
      await typeInto(el, a.type, { clear: a.clear !== false, fast: quick, cps: (a.cps || 13) * this.rate, gate: () => this.gate(token) });
      if (this.state.cursor) this.set({ cursor: { ...this.state.cursor, typing: false } });
      return this.wait(a.after ?? 300, token);
    }
    throw new Error(`Unknown tour action ${JSON.stringify(a)}`);
  }

  async acts(list, token) {
    for (const a of list || []) await this.act(a, token);
  }

  async playBeat(i, token) {
    const b = variant(this.beats[i]);
    if (b.skip) return;
    // Optional beats are for controls that only some setups show
    if (b.optional && !find(b.optional === true ? b.focus : b.optional)) return;
    const quick = this.fast;
    this.skipping = false;
    if (!quick) this.set({ index: i, progress: 0, caption: "", cursor: null, fx: b.keepFx ? this.state.fx : [] });

    if (b.firstInChapter && !quick && b.chapter.title && !b.chapter.noCard) {
      this.set({ card: { n: b.chapterIndex + 1, title: b.chapter.title[this.lang] || b.chapter.title.en }, focus: null, cursor: null });
      await this.wait(2300, token);
      this.set({ card: null });
      await this.wait(350, token);
    }

    await this.acts(b.before, token);

    if (b.focus !== undefined && !quick) {
      const spec = Array.isArray(b.focus) && b.focus[0]?.union ? b.focus[0].union : b.focus;
      // Cards and dialogs fade in, so give the target a moment to appear
      const el = b.focus && (find(spec) || (await waitFor(spec, { timeout: 1500 }).catch(() => null)));
      // Plays on without a light, but the line may describe something that isn't there
      if (b.focus && !el) console.warn(`[guide] focus not found ${b.id}`);
      if (el && scrollIntoViewIfNeeded(el)) await this.wait(450, token);
      this.set({ focus: b.focus, look: b.look || "spot" });
    } else if (!quick && b.look) this.set({ look: b.look });

    if (quick) {
      await this.acts(b.during, token);
      await this.acts(b.after, token);
      return;
    }

    if (b.fx) this.set({ fx: [...(b.keepFx ? this.state.fx : []), ...(Array.isArray(b.fx) ? b.fx : [b.fx]).map((f) => ({ ...f, key: `${i}-${Math.random()}` }))] });

    const text = b.say?.[this.lang] || b.say?.en || "";
    this.set({ caption: text, progress: 0 });
    // Fetch the next couple of lines while this one plays
    preload(
      this.beats.slice(i + 1, i + 3).map((n) => ({ tour: this.tour.id, beat: n.id, lang: this.lang, text: n.say?.[this.lang] || "" }))
    );
    const speech = text ? speak({ tour: this.tour.id, beat: b.id, lang: this.lang, text, rate: this.rate, onProgress: (p) => {
      // Captions light up word by word; ~2% steps are plenty and spare re-renders
      if (token === this.token && (p >= 1 || Math.abs(p - this.state.progress) >= 0.02)) this.set({ progress: p });
    } }) : Promise.resolve();
    const doing = (async () => {
      await this.wait(b.delay ?? 500, token);
      await this.acts(b.during, token);
    })();
    await Promise.all([speech, doing]);
    this.alive(token);
    await this.acts(b.after, token);
    await this.wait(b.hold ?? 450, token);
  }

  async playFrom(i, token) {
    try {
      for (let k = i; k < this.beats.length; k++) {
        this.alive(token);
        try {
          await this.playBeat(k, token);
        } catch (err) {
          if (err instanceof Cancelled) throw err;
          console.warn(`[guide] beat failed ${this.beats[k].id}: ${err?.message || err}`);
          // The page wasn't where the beat expected (e.g. the user clicked
          // around while paused): rebuild it once and carry on
          if (this.recovered !== k) {
            this.recovered = k;
            return this.jump(k);
          }
          this.set({ status: "error", error: this.beats[k].id });
          return;
        }
      }
      stopSpeaking();
      this.set({ status: "done", focus: null, fx: [], cursor: null, caption: "" });
    } catch (err) {
      if (!(err instanceof Cancelled)) throw err;
    }
  }

  start(i = 0) {
    const token = ++this.token;
    this.set({ status: "playing", error: null });
    return this.playFrom(i, token);
  }

  // Rebuild the demo page, fast-forward to beat i, then play from there
  async jump(i) {
    const token = ++this.token;
    this.fast = false;
    stopSpeaking();
    this.paused = false;
    this.set({ status: "playing", paused: false, focus: null, fx: [], cursor: null, caption: "", card: null, busy: true, index: i });
    try {
      await this.env.resetStage();
      this.alive(token);
      this.fast = true;
      for (let k = 0; k < i; k++) await this.playBeat(k, token);
      this.fast = false;
      this.set({ busy: false });
      await this.playFrom(i, token);
    } catch (err) {
      // A newer jump owns fast mode now
      if (err instanceof Cancelled) return;
      this.fast = false;
      console.warn(`[guide] jump failed: ${err?.message || err}`);
      this.set({ status: "error", busy: false, error: this.beats[i]?.id });
    }
  }

  next() {
    if (this.state.status !== "playing") return;
    this.skipping = true;
    if (this.paused) this.resume();
    stopSpeaking();
  }

  // Beats that only talk can be replayed in place; one that changes the page
  // means rebuilding it
  canRewind(to, from) {
    for (let k = to; k <= from; k++) {
      const b = variant(this.beats[k]);
      if ((b.before || []).length || (b.during || []).length || (b.after || []).length) return false;
    }
    return true;
  }

  goTo(i) {
    if (i <= this.state.index && this.canRewind(i, this.state.index)) {
      stopSpeaking();
      this.paused = false;
      this.set({ paused: false });
      return this.start(i);
    }
    return this.jump(i);
  }

  prev() {
    return this.goTo(Math.max(0, this.state.index - 1));
  }

  restartBeat() {
    return this.jump(this.state.index);
  }

  pause() {
    this.paused = true;
    pauseSpeaking();
    this.set({ paused: true });
  }

  resume() {
    this.paused = false;
    resumeSpeaking();
    this.set({ paused: false });
  }

  setRate(r) {
    this.rate = r;
    setSpeakingRate(r);
  }

  setLang(lang) {
    this.lang = lang;
  }

  stop() {
    this.token++;
    this.paused = false;
    stopSpeaking();
  }
}
