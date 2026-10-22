import { useCallback, useEffect, useRef, useState } from "react";

const Recognition = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

// Speech-to-text with the browser's recognizer. hi-IN understands Hindi and
// Hinglish (and plenty of English); en-IN is there for English-only speakers.
// Phones (Android Chrome, iOS Safari) often keep listening after you stop
// talking and never mark the text final, so we end the turn ourselves after a
// short silence and send whatever was heard.
const SILENCE_MS = 1500;

export function useVoiceInput({ lang = "hi-IN", onFinal } = {}) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const recRef = useRef(null);
  const finalRef = useRef(onFinal);
  finalRef.current = onFinal;

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    if (!Recognition || listening) return;
    const rec = new Recognition();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let heard = "";
    let silence = null;
    let sent = false;
    const send = () => {
      if (sent) return;
      sent = true;
      clearTimeout(silence);
      if (heard.trim()) finalRef.current?.(heard.trim());
    };
    rec.onresult = (e) => {
      // Rebuild from every result: some phones resend earlier segments
      let finals = "";
      let live = "";
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finals += t;
        else live += t;
      }
      heard = (finals + live).replace(/\s+/g, " ");
      setInterim(heard);
      clearTimeout(silence);
      silence = setTimeout(() => {
        send();
        try {
          rec.stop();
        } catch {}
      }, SILENCE_MS);
    };
    rec.onerror = () => {};
    rec.onend = () => {
      clearTimeout(silence);
      setListening(false);
      setInterim("");
      recRef.current = null;
      send();
    };
    recRef.current = rec;
    setListening(true);
    rec.start();
  }, [lang, listening]);

  useEffect(() => () => recRef.current?.abort(), []);

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
