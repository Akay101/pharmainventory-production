import React, { useState, useEffect } from "react";
import { Button } from "./button";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle({ className = "" }) {
  const [isDark, setIsDark] = useState(() => {
    return !document.documentElement.classList.contains("light");
  });

  useEffect(() => {
    const handleClassChange = () => {
      setIsDark(!document.documentElement.classList.contains("light"));
    };

    const observer = new MutationObserver(handleClassChange);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.remove("light");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.add("light");
      localStorage.setItem("theme", "light");
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className={`relative h-10 w-10 rounded-xl border border-border/80 dark:border-border/60 hover:bg-muted/80 backdrop-blur-md transition-all active:scale-95 shadow-sm ${className}`}
      title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      data-testid="theme-toggle-btn"
    >
      {isDark ? (
        <Sun className="w-5 h-5 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.4)]" />
      ) : (
        <Moon className="w-5 h-5 text-orange-600 drop-shadow-[0_0_8px_rgba(234,88,12,0.3)]" />
      )}
    </Button>
  );
}
