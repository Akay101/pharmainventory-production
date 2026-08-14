import React from "react";
import { cn } from "@/lib/utils";

export function AiLoader({ size = "md", text = "AI is processing...", className = "" }) {
  const scaleStyle =
    size === "xs"
      ? { transform: "scale(0.45)" }
      : size === "sm"
      ? { transform: "scale(0.65)" }
      : size === "lg"
      ? { transform: "scale(1.1)" }
      : { transform: "scale(0.85)" };

  return (
    <div className={cn("flex flex-col items-center justify-center text-center select-none py-4 gap-3", className)}>
      <div style={scaleStyle} className="flex items-center justify-center">
        <div className="ai-wave-container">
          <div className="dot"></div>
          <div className="dot"></div>
          <div className="dot"></div>
          <div className="dot"></div>
          <div className="dot"></div>
          <div className="dot"></div>
          <div className="dot"></div>
          <div className="dot"></div>
          <div className="dot"></div>
          <div className="dot"></div>
          <div className="dot"></div>
          <div className="dot"></div>
          <div className="dot"></div>
          <div className="dot"></div>
          <div className="dot"></div>
          <div className="dot"></div>
        </div>
      </div>
      {text && (
        <p className="text-xs font-bold uppercase tracking-widest text-orange-500 animate-pulse">
          {text}
        </p>
      )}
    </div>
  );
}

export default function Loader({
  size = "lg",
  text = "",
  fullScreen = false,
  className = "",
  variant = "default",
}) {
  if (variant === "ai") {
    return <AiLoader size={size} text={text} className={className} />;
  }

  if (variant === "button") {
    return (
      <div className={cn("inline-flex items-center justify-center gap-2", className)}>
        <span className="relative flex h-3 w-3 items-center justify-center">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-current"></span>
        </span>
        {text && <span>{text}</span>}
      </div>
    );
  }

  const scaleStyle =
    size === "xs"
      ? { transform: "scale(0.45)" }
      : size === "sm"
      ? { transform: "scale(0.65)" }
      : size === "md"
      ? { transform: "scale(0.85)" }
      : {};

  const isSmall = size === "sm" || size === "xs";

  const content = (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center select-none",
        isSmall ? "gap-2 py-2" : "gap-6 py-10",
        className
      )}
    >
      {/* 3D Cube Spinner */}
      <div className="cube-spinner-wrapper">
        <div className="cube-spinner-container" style={scaleStyle}>
          <div className="cube-spinner">
            <div />
            <div />
            <div />
            <div />
            <div />
            <div />
          </div>
        </div>
      </div>

      {/* Loader Text Below Spinner */}
      {text && (
        <p
          className={cn(
            "font-bold uppercase tracking-widest text-primary animate-pulse",
            isSmall ? "text-[10px]" : "text-xs"
          )}
        >
          {text}
        </p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md">
        {content}
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <div className={cn("flex items-center justify-center w-full h-full my-auto", className)}>
        {content}
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center w-full min-h-[calc(100vh-160px)] my-auto">
      {content}
    </div>
  );
}
