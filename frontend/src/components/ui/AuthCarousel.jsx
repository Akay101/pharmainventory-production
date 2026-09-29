import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  Zap,
  ChevronLeft,
  ChevronRight,
  ScanLine,
  Layers,
  Receipt,
  RotateCcw,
  Users,
  BarChart3,
  Boxes,
  FileCheck,
} from "lucide-react";

const SLIDES = [
  {
    id: "ocr-1",
    category: "AI OCR ENGINE",
    categoryIcon: ScanLine,
    title: "Instant Invoice Ingestion",
    description:
      "Snap a photo or upload distributor invoices. DavaDesk extracts items, batches, MRP, expiry, and GST rates automatically.",
    image: "/assets/svgs/ocrProcess/ocr-step-01-scan-invoice.png",
    statBadge: "99.4% Extraction Accuracy",
  },
  {
    id: "ocr-2",
    category: "NEURAL EXTRACTION",
    categoryIcon: Zap,
    title: "Smart AI Entity Mapping",
    description:
      "Distributor medicine lines are matched to your master catalog with intelligent salt and composition recognition.",
    image: "/assets/svgs/ocrProcess/ocr-step-02-ai-processing.png",
    statBadge: "Zero Manual Data Entry",
  },
  {
    id: "ocr-3",
    category: "STOCK INGESTION",
    categoryIcon: Layers,
    title: "1-Click Inventory Sync",
    description:
      "Verify extracted batches and update shelf quantities across your pharmacy instantly with complete audit logs.",
    image: "/assets/svgs/ocrProcess/ocr-step-03-inventory-result.png",
    statBadge: "Live Cost & Margin Updates",
  },
  {
    id: "ocr-bulk",
    category: "BATCH OCR QUEUE",
    categoryIcon: FileCheck,
    title: "Bulk Invoice Processing",
    description:
      "Upload stacks of distributor bills at once. Background workers process each bill while you continue serving counter customers.",
    image: "/assets/svgs/ocrProcess/ocr-bulk-invoices.png",
    statBadge: "Multi-Invoice Async Queue",
  },
  {
    id: "feat-billing",
    category: "FAST POS CHECKOUT",
    categoryIcon: Receipt,
    title: "Lightning POS Billing",
    description:
      "Scan barcodes or search by generic salt name. Bill with multi-mode payment, automatic GST calculation, and WhatsApp invoices.",
    image: "/assets/svgs/features/billing.png",
    statBadge: "< 2s Average Checkout",
  },
  {
    id: "feat-inventory",
    category: "INVENTORY CONTROL",
    categoryIcon: Boxes,
    title: "Batch & Expiry Intelligence",
    description:
      "Track every strip and bottle by batch number, rack position, and expiry date with automated reorder thresholds.",
    image: "/assets/svgs/features/inventory.png",
    statBadge: "Real-Time Stock Audits",
  },
  {
    id: "feat-expiry",
    category: "LOSS PREVENTION",
    categoryIcon: RotateCcw,
    title: "Expiry & Supplier Returns",
    description:
      "Detect expiring batches months ahead, bundle them into supplier return memos, and track debit credit adjustments.",
    image: "/assets/svgs/features/expiry.png",
    statBadge: "Prevent Expiry Losses",
  },
  {
    id: "feat-customers",
    category: "CUSTOMER KHATA",
    categoryIcon: Users,
    title: "Ledgers & Patient Khata",
    description:
      "Manage customer credit limits, purchase histories, loyalty discounts, and automated payment reminder summaries.",
    image: "/assets/svgs/features/customers.png",
    statBadge: "Digital Udhar Management",
  },
  {
    id: "feat-reports",
    category: "EXECUTIVE BI",
    categoryIcon: BarChart3,
    title: "Analytics & Tax Filings",
    description:
      "Real-time revenue metrics, profit margin heatmaps, top selling products, and 1-click GST filing reports.",
    image: "/assets/svgs/features/reports.png",
    statBadge: "GST Ready Reports",
  },
];

export default function AuthCarousel({ autoPlayInterval = 4500 }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef(null);

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % SLIDES.length);
  };

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + SLIDES.length) % SLIDES.length);
  };

  const goToSlide = (index) => {
    setCurrentIndex(index);
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

  const current = SLIDES[currentIndex];
  const IconComponent = current.categoryIcon || Sparkles;

  return (
    <div
      className="w-full relative select-none"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Full-bleed Showcase Card */}
      <div className="relative rounded-3xl border border-border/80 dark:border-zinc-800/80 bg-card/60 dark:bg-zinc-950/80 backdrop-blur-2xl shadow-2xl overflow-hidden group transition-all duration-300 hover:border-orange-500/30">
        {/* Top Glow Highlight */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-400 z-30" />

        {/* Full Image Presentation with Ambient Gradient Mask */}
        <div className="relative w-full h-56 sm:h-64 lg:h-72 overflow-hidden bg-zinc-950">
          {SLIDES.map((slide, idx) => (
            <div
              key={slide.id}
              className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
                idx === currentIndex
                  ? "opacity-100 scale-100 z-10 pointer-events-auto"
                  : "opacity-0 scale-105 z-0 pointer-events-none"
              }`}
            >
              <img
                src={slide.image}
                alt={slide.title}
                className="w-full h-full object-cover object-center transform transition-transform duration-1000 group-hover:scale-105"
                loading="eager"
              />
            </div>
          ))}

          {/* Seamless Vignette & Gradient Overlays */}
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent z-20 pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-r from-zinc-950/50 via-transparent to-zinc-950/30 z-20 pointer-events-none" />

          {/* Top Floating Badge & Navigation */}
          <div className="absolute top-3.5 left-4 right-4 z-30 flex items-center justify-between">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-950/80 border border-orange-500/30 backdrop-blur-md shadow-lg">
              <IconComponent className="w-3.5 h-3.5 text-orange-500 animate-pulse" />
              <span className="text-[10px] font-mono font-extrabold text-orange-400 uppercase tracking-wider">
                {current.category}
              </span>
            </div>

            <div className="flex items-center gap-1 bg-zinc-950/80 border border-zinc-800 backdrop-blur-md rounded-full px-2 py-0.5 shadow-lg">
              <button
                type="button"
                onClick={prevSlide}
                className="p-1 rounded-full text-zinc-400 hover:text-white transition-colors"
                aria-label="Previous slide"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] font-mono text-zinc-300 font-bold px-1">
                {currentIndex + 1}/{SLIDES.length}
              </span>
              <button
                type="button"
                onClick={nextSlide}
                className="p-1 rounded-full text-zinc-400 hover:text-white transition-colors"
                aria-label="Next slide"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Floating Metric Badge over image */}
          <div className="absolute bottom-3 left-4 z-30 flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-950/85 border border-zinc-800/80 backdrop-blur-md shadow-lg">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <span className="text-[10px] font-bold text-zinc-200 font-mono">
              {current.statBadge}
            </span>
          </div>
        </div>

        {/* Slide Title & Description Section */}
        <div className="p-4 sm:p-5 space-y-2.5 bg-card/90 dark:bg-zinc-950/90 border-t border-border/70 dark:border-zinc-800/80">
          <div className="flex items-center justify-between">
            <h3 className="text-base sm:text-lg font-black text-foreground tracking-tight line-clamp-1">
              {current.title}
            </h3>
          </div>
          <p className="text-xs text-muted-foreground font-medium leading-relaxed line-clamp-2">
            {current.description}
          </p>

          {/* Animated Slide Progress Bars / Indicators */}
          <div className="flex items-center gap-1.5 pt-1">
            {SLIDES.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => goToSlide(idx)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === currentIndex
                    ? "w-8 bg-gradient-to-r from-orange-500 to-amber-500 shadow-xs shadow-orange-500/50"
                    : "w-2 bg-border/80 dark:bg-zinc-800 hover:bg-muted-foreground/40"
                }`}
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
