import { useCallback, useEffect, useRef, useState } from "react";

const Recognition = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

// Speech-to-text with the browser's recognizer: the fallback for voice typing
// when the server's Whisper can't be used (no credits, offline). hi-IN
// understands Hindi and Hinglish (and plenty of English); en-IN is for
// English-only speakers. It keeps listening until the user stops: nothing is
// sent on a pause. Desktop Chrome listens continuously; Android Chrome repeats
// words in continuous mode, so there each pause ends a recognition session
// and a new one starts, and the words are joined. iOS Safari behaves like
// desktop. The text arrives through onFinal when the user stops.
const MAX_LISTEN_MS = 3 * 60 * 1000;
const isAndroid = typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);

export function useVoiceInput({ lang = "hi-IN", onFinal } = {}) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const sessionRef = useRef(null);
  const finalRef = useRef(onFinal);
  finalRef.current = onFinal;

  // The user's own stop: hand over what was heard
  const stop = useCallback(() => sessionRef.current?.finish(), []);

  const start = useCallback(() => {
    if (!Recognition || listening) return;
    let earlier = ""; // words from previous recognition sessions (Android, pauses)
    let heard = "";
    let done = false;
    let rec = null;
    let limit = null;

    const end = () => {
      clearTimeout(limit);
      setListening(false);
      setInterim("");
      sessionRef.current = null;
    };
    const finish = () => {
      if (done) return;
      done = true;
      end();
      try {
        rec?.stop();
      } catch {}
      finalRef.current?.(heard.replace(/\s+/g, " ").trim());
    };

    const listen = () => {
      rec = new Recognition();
      rec.lang = lang;
      rec.interimResults = true;
      rec.continuous = !isAndroid;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        // Rebuild from every result: some phones resend earlier segments
        let finals = "";
        let live = "";
        for (let i = 0; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) finals += t;
          else live += t;
        }
        heard = `${earlier} ${finals}${live}`.replace(/\s+/g, " ").trim();
        setInterim(heard);
      };
      rec.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture") {
          done = true;
          end();
          finalRef.current?.(heard.trim(), { error: e.error });
        }
      };
      rec.onend = () => {
        if (done) return;
        // The browser stopped at a pause; the user hasn't: listen again
        earlier = heard;
        try {
          listen();
        } catch {
          finish();
        }
      };
      rec.start();
    };

    sessionRef.current = {
      finish,
      abort: () => {
        done = true;
        clearTimeout(limit);
        try {
          rec?.abort();
        } catch {}
      },
    };
    setListening(true);
    limit = setTimeout(finish, MAX_LISTEN_MS);
    try {
      listen();
    } catch {
      done = true;
      end();
    }
  }, [lang, listening]);

  useEffect(() => () => sessionRef.current?.abort(), []);

  return { supported: !!Recognition, listening, interim, start, stop };
}

// Reads a reply aloud in a matching Indian voice
export function speak(text, language) {
  if (typeof window === "undefined" || !window.speechSynthesis) return false;
  window.speechSynthesis.cancel();
  const plain = String(text || "")
    .replace(/[#*_`>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return false;
  const u = new SpeechSynthesisUtterance(plain);
  const want = language === "en" ? "en-IN" : "hi-IN";
  const voices = window.speechSynthesis.getVoices();
  u.voice = voices.find((v) => v.lang === want) || voices.find((v) => v.lang?.startsWith(want.slice(0, 2))) || null;
  u.lang = want;
  u.rate = 1.02;
  window.speechSynthesis.speak(u);
  return true;
}

export const stopSpeaking = () => window.speechSynthesis?.cancel();
