import React from "react";
import { cn } from "@/lib/utils";

export default function Loader({
  size = "lg",
  text = "",
  fullScreen = false,
  className = "",
  variant = "default",
}) {
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

  const content = (
    <div className={cn("flex flex-col items-center justify-center gap-6 text-center select-none py-10", className)}>
      {/* 3D Cube Spinner */}
      <div className="py-2">
        <div className="cube-spinner">
          <div />
          <div />
          <div />
          <div />
          <div />
          <div />
        </div>
      </div>

      {/* Loader Text Below Spinner */}
      {text && (
        <p className="text-xs font-bold uppercase tracking-widest text-primary animate-pulse">
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

  return (
    <div className="flex items-center justify-center w-full min-h-[50vh] flex-1 my-auto">
      {content}
    </div>
  );
}
