import React, { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";

export const AUTH_SLIDES = [
  {
    id: "scan-bills",
    tag: "Bill Scanner",
    title: "Scan purchase bills instantly",
    description:
      "Take a photo of any distributor invoice. DavaDesk automatically reads medicine names, batch numbers, expiry dates, and MRP without manual typing.",
    image: "/assets/svgs/ocrProcess/ocr-step-01-scan-invoice.png",
  },
  {
    id: "auto-map",
    tag: "Smart Matching",
    title: "Match medicines to your inventory",
    description:
      "Invoice items are matched directly to your medicine catalog, tax rates, and packing units.",
    image: "/assets/svgs/ocrProcess/ocr-step-02-ai-processing.png",
  },
  {
    id: "add-stock",
    tag: "Stock Update",
    title: "Update inventory in seconds",
    description:
      "Check the invoice summary and instantly add new stock and batches to your pharmacy shelves.",
    image: "/assets/svgs/ocrProcess/ocr-step-03-inventory-result.png",
  },
  {
    id: "bulk-bills",
    tag: "Bulk Upload",
    title: "Upload multiple invoices at once",
    description:
      "Queue multiple distributor bills together while you focus on attending customers at the counter.",
    image: "/assets/svgs/ocrProcess/ocr-bulk-invoices.png",
  },
  {
    id: "pos-billing",
    tag: "Counter Billing",
    title: "Fast billing & customer receipts",
    description:
      "Search medicines quickly, scan barcodes, and create GST bills with WhatsApp and thermal print options.",
    image: "/assets/svgs/features/billing.png",
  },
  {
    id: "stock-tracking",
    tag: "Inventory",
    title: "Track batch stock & rack locations",
    description:
      "See live stock on your shelves, exact batch numbers, expiry dates, and receive low stock alerts.",
    image: "/assets/svgs/features/inventory.png",
  },
  {
    id: "expiry-returns",
    tag: "Expiry Alerts",
    title: "Manage near-expiry & returns",
    description:
      "Get alerts before medicines expire and easily create return lists for your suppliers.",
    image: "/assets/svgs/features/expiry.png",
  },
  {
    id: "customer-khata",
    tag: "Customer Ledger",
    title: "Manage customer udhar & balances",
    description:
      "Track customer credit history, outstanding balances, and send gentle payment reminders.",
    image: "/assets/svgs/features/customers.png",
  },
  {
    id: "reports-analytics",
    tag: "Reports",
    title: "Daily sales & profit overview",
    description:
      "View daily sales, track your earnings and profit margins, and export ready reports for GST filing.",
    image: "/assets/svgs/features/reports.png",
  },
];

export default function AuthLeftPanel({
  steps = null,
  currentStep = 0,
  autoPlayInterval = 4500,
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef(null);

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % AUTH_SLIDES.length);
  };

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + AUTH_SLIDES.length) % AUTH_SLIDES.length);
  };

  useEffect(() => {
    if (isPaused) return;

    timerRef.current = setInterval(() => {
      nextSlide();
    }, autoPlayInterval);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentIndex, isPaused, autoPlayInterval]);

  const current = AUTH_SLIDES[currentIndex];

  return (
    <div
      className="relative w-full h-full min-h-screen overflow-hidden flex flex-col justify-between p-8 lg:p-12 select-none"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* 1. Full-Bleed Background Images with Smooth Cross-Fade */}
      {AUTH_SLIDES.map((slide, idx) => (
        <div
          key={slide.id}
          className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
            idx === currentIndex
              ? "opacity-100 scale-100 z-0"
              : "opacity-0 scale-105 -z-10 pointer-events-none"
          }`}
        >
          <img
            src={slide.image}
            alt={slide.title}
            className="w-full h-full object-cover object-center"
            loading="eager"
          />
        </div>
      ))}

      {/* 2. Seamless Ambient Dark Vignette and Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/65 to-black/75 z-10 pointer-events-none" />
      <div className="absolute inset-0 bg-black/40 z-10 pointer-events-none" />

      {/* 3. Top Header: Logo and Brand Name */}
      <div className="relative z-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src="/assets/svgs/logoBrand/logoOnlyWithoutBackground.svg"
            alt="DavaDesk"
            className="w-10 h-10 object-contain shrink-0 drop-shadow-md"
          />
          <div className="flex flex-col">
            <span className="font-extrabold text-2xl tracking-tight text-white leading-tight">
              DavaDesk
            </span>
            <span className="text-[11px] font-semibold text-zinc-300">
              Smart Pharmacy Software
            </span>
          </div>
        </div>
      </div>

      {/* 4. Optional Registration Steps Progress (Shown on Register Page) */}
      {steps && steps.length > 0 && (
        <div className="relative z-20 my-6 space-y-2.5 max-w-md">
          <div className="inline-block px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-orange-400 text-xs font-bold uppercase tracking-wider">
            Step {currentStep + 1} of {steps.length}
          </div>
          <div className="space-y-2">
            {steps.map((s, i) => {
              const isActive = i === currentStep;
              const isCompleted = i < currentStep;
              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border backdrop-blur-md transition-all duration-300 ${
                    isActive
                      ? "bg-black/60 border-orange-500/80 shadow-lg"
                      : isCompleted
                      ? "bg-black/40 border-white/20"
                      : "bg-black/20 border-white/10 opacity-60"
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                      isCompleted
                        ? "bg-emerald-500 text-white"
                        : isActive
                        ? "bg-orange-500 text-white shadow-md shadow-orange-500/30"
                        : "bg-white/10 text-zinc-300"
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span
                    className={`text-xs font-bold ${
                      isActive ? "text-orange-400" : "text-zinc-200"
                    }`}
                  >
                    {s}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. Bottom Showcase Area: Simple Clear Feature Text & Controls */}
      <div className="relative z-20 mt-auto space-y-4 max-w-xl">
        {/* Simple Tag Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-orange-500/20 backdrop-blur-md border border-orange-500/40 text-orange-400 text-xs font-extrabold uppercase tracking-wider">
          <span>{current.tag}</span>
        </div>

        {/* Big Clear Title */}
        <h2 className="text-2xl lg:text-3xl font-black text-white tracking-tight leading-snug">
          {current.title}
        </h2>

        {/* Clear Simple Description */}
        <p className="text-sm lg:text-base text-zinc-200 font-medium leading-relaxed max-w-lg">
          {current.description}
        </p>

        {/* Carousel Slide Indicators & Navigation Buttons */}
        <div className="flex items-center justify-between pt-2">
          {/* Dot Indicators */}
          <div className="flex items-center gap-2">
            {AUTH_SLIDES.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === currentIndex
                    ? "w-8 bg-orange-500 shadow-md shadow-orange-500/50"
                    : "w-2 bg-white/30 hover:bg-white/60"
                }`}
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>

          {/* Prev / Next Buttons */}
          <div className="flex items-center gap-1.5 bg-black/50 border border-white/15 backdrop-blur-md rounded-full px-2 py-1">
            <button
              type="button"
              onClick={prevSlide}
              className="p-1 rounded-full text-zinc-300 hover:text-white transition-colors"
              aria-label="Previous slide"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[11px] font-mono text-zinc-300 font-bold px-1">
              {currentIndex + 1} / {AUTH_SLIDES.length}
            </span>
            <button
              type="button"
              onClick={nextSlide}
              className="p-1 rounded-full text-zinc-300 hover:text-white transition-colors"
              aria-label="Next slide"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Copyright Footer */}
        <div className="text-xs text-zinc-400 font-medium pt-3 border-t border-white/10">
          © {new Date().getFullYear()} DavaDesk. All rights reserved.
        </div>
      </div>
    </div>
  );
}
