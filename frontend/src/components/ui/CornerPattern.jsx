import React from "react";

export default function CornerPattern({ className = "" }) {
  return (
    <div
      className={`absolute bottom-0 right-0 w-72 h-72 pointer-events-none overflow-hidden z-0 select-none ${className}`}
    >
      {/* Soft Ambient Radial Blur Orb */}
      <div className="absolute bottom-[-30%] right-[-30%] w-64 h-64 rounded-full bg-gradient-to-tl from-orange-500/15 via-amber-500/10 to-transparent blur-3xl" />

      {/* Decorative Dot Matrix SVG */}
      <svg
        className="absolute bottom-4 right-4 w-48 h-48 opacity-30 dark:opacity-20 text-orange-500"
        fill="currentColor"
        viewBox="0 0 160 160"
      >
        <pattern
          id="corner-dots"
          x="0"
          y="0"
          width="16"
          height="16"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="2" cy="2" r="1.5" />
        </pattern>
        <rect width="160" height="160" fill="url(#corner-dots)" />
      </svg>

      {/* Subtle Corner Concentric Accent Lines */}
      <svg
        className="absolute bottom-0 right-0 w-56 h-56 opacity-20 dark:opacity-15 text-orange-500 stroke-current fill-none"
        viewBox="0 0 200 200"
      >
        <circle cx="200" cy="200" r="180" strokeWidth="1.5" strokeDasharray="4 4" />
        <circle cx="200" cy="200" r="140" strokeWidth="1.5" />
        <circle cx="200" cy="200" r="100" strokeWidth="1.5" strokeDasharray="6 6" />
        <circle cx="200" cy="200" r="60" strokeWidth="1.5" />
      </svg>
    </div>
  );
}
