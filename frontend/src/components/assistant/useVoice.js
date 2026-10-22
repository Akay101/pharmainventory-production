import { useCallback, useEffect, useRef, useState } from "react";

const Recognition = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

// Speech-to-text with the browser's recognizer. hi-IN understands Hindi and
// Hinglish (and plenty of English); en-IN is there for English-only speakers.
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
    let finalText = "";
    rec.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else live += t;
      }
      setInterim(finalText + live);
    };
    rec.onerror = () => {};
    rec.onend = () => {
      setListening(false);
      setInterim("");
      recRef.current = null;
      if (finalText.trim()) finalRef.current?.(finalText.trim());
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
