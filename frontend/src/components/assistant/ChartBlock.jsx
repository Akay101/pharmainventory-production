import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, Download, Maximize2, Table2, TrendingDown, TrendingUp, X } from "lucide-react";
import { inr } from "./assistantClient";

const COLORS = ["#f97316", "#8b5cf6", "#0ea5e9", "#10b981", "#ec4899", "#f59e0b", "#6366f1", "#14b8a6", "#ef4444", "#84cc16"];
const GRID = "rgba(128,128,128,0.16)";
const AXIS = { fontSize: 11, fill: "currentColor" };

const compactInr = (v) => {
  const n = Number(v) || 0;
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(1).replace(/\.0$/, "")}Cr`;
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(1).replace(/\.0$/, "")}L`;
  if (a >= 1e3) return `₹${(n / 1e3).toFixed(1).replace(/\.0$/, "")}k`;
  return `₹${Math.round(n * 100) / 100}`;
};
const fmt = (format, v, compact = false) =>
  format === "inr" ? (compact ? compactInr(v) : inr(v)) : format === "percent" ? `${Math.round((Number(v) || 0) * 10) / 10}%` : (Number(v) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

function TooltipCard({ active, payload, label, series }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-semibold text-foreground">{label ?? payload[0]?.payload?.x}</p>
      {payload.map((p) => {
        const s = series.find((x) => x.key === p.dataKey) || series[0];
        return (
          <p key={p.dataKey + p.name} className="flex items-center gap-2 text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.payload?.fill }} />
            {s?.label}: <span className="font-semibold text-foreground">{fmt(s?.format, p.value)}</span>
          </p>
        );
      })}
    </div>
  );
}

function ChartBody({ block, height }) {
  const { chart, series, rows } = block;
  const left = series.filter((s) => s.axis !== "right");
  const right = series.filter((s) => s.axis === "right");
  const leftFmt = left[0]?.format || "number";
  const rightFmt = right[0]?.format || "number";
  const manyX = rows.length > 12;
  const xProps = { dataKey: "x", tick: AXIS, tickLine: false, axisLine: false, interval: manyX ? "preserveStartEnd" : 0, minTickGap: 8 };
  const yProps = (f, id = "left", orientation = "left") => ({ yAxisId: id, orientation, tick: AXIS, tickLine: false, axisLine: false, width: 56, tickFormatter: (v) => fmt(f, v, true) });
  const tooltip = <Tooltip content={<TooltipCard series={series} />} cursor={{ fill: "rgba(249,115,22,0.06)", stroke: "rgba(249,115,22,0.3)" }} />;
  const legend = series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" /> : null;
  const gradients = (
    <defs>
      {series.map((s, i) => (
        <linearGradient key={s.key} id={`g-${block._id}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={COLORS[i]} stopOpacity={0.35} />
          <stop offset="100%" stopColor={COLORS[i]} stopOpacity={0.02} />
        </linearGradient>
      ))}
    </defs>
  );

  if (chart === "donut") {
    const s = series[0];
    const total = rows.reduce((a, r) => a + (Number(r[s.key]) || 0), 0);
    return (
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
        <div className="relative" style={{ width: 220, height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={rows} dataKey={s.key} nameKey="x" innerRadius={62} outerRadius={100} paddingAngle={2} stroke="none">
                {rows.map((r, i) => (
                  <Cell key={r.x} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<TooltipCard series={series} />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[11px] text-muted-foreground">Total</span>
            <span className="text-base font-bold">{fmt(s.format, total, true)}</span>
          </div>
        </div>
        <div className="w-full flex-1 space-y-1.5">
          {rows.map((r, i) => (
            <div key={r.x} className="flex items-center gap-2 text-sm">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
              <span className="min-w-0 flex-1 truncate">{r.x}</span>
              <span className="tabular-nums font-semibold">{fmt(s.format, r[s.key])}</span>
              <span className="w-10 text-right text-xs text-muted-foreground">{total ? Math.round(((Number(r[s.key]) || 0) / total) * 100) : 0}%</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (chart === "hbar") {
    const h = Math.max(height, rows.length * 34 + 30);
    return (
      <ResponsiveContainer width="100%" height={h}>
        <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => fmt(leftFmt, v, true)} />
          <YAxis type="category" dataKey="x" tick={AXIS} tickLine={false} axisLine={false} width={130} tickFormatter={(v) => (String(v).length > 18 ? `${String(v).slice(0, 17)}…` : v)} />
          {tooltip}
          {legend}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={COLORS[i]} radius={[0, 6, 6, 0]} maxBarSize={22} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (chart === "line" || chart === "area") {
    const C = chart === "area" ? AreaChart : LineChart;
    return (
      <ResponsiveContainer width="100%" height={height}>
        <C data={rows} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
          {gradients}
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis {...xProps} />
          <YAxis {...yProps(leftFmt)} />
          {right.length > 0 && <YAxis {...yProps(rightFmt, "right", "right")} />}
          {tooltip}
          {legend}
          {series.map((s, i) =>
            chart === "area" ? (
              <Area key={s.key} yAxisId={s.axis === "right" ? "right" : "left"} type="monotone" dataKey={s.key} name={s.label} stroke={s.dashed ? "#94a3b8" : COLORS[i]} strokeWidth={s.dashed ? 2 : 2.5} strokeDasharray={s.dashed ? "6 4" : undefined} fill={s.dashed ? "none" : `url(#g-${block._id}-${s.key})`} dot={false} activeDot={{ r: 5 }} />
            ) : (
              <Line key={s.key} yAxisId={s.axis === "right" ? "right" : "left"} type="monotone" dataKey={s.key} name={s.label} stroke={s.dashed ? "#94a3b8" : COLORS[i]} strokeWidth={s.dashed ? 2 : 2.5} strokeDasharray={s.dashed ? "6 4" : undefined} dot={!s.dashed && rows.length <= 14 ? { r: 3 } : false} activeDot={{ r: 5 }} />
            )
          )}
        </C>
      </ResponsiveContainer>
    );
  }

  if (chart === "combo") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={rows} margin={{ left: 0, right: 4, top: 8, bottom: 0 }}>
          {gradients}
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis {...xProps} />
          <YAxis {...yProps(leftFmt)} />
          <YAxis {...yProps(right.length ? rightFmt : leftFmt, "right", "right")} />
          {tooltip}
          {legend}
          {series.map((s, i) =>
            i === 0 ? (
              <Bar key={s.key} yAxisId="left" dataKey={s.key} name={s.label} fill={COLORS[i]} radius={[6, 6, 0, 0]} maxBarSize={36} />
            ) : (
              <Line key={s.key} yAxisId={s.axis === "right" ? "right" : "left"} type="monotone" dataKey={s.key} name={s.label} stroke={COLORS[i]} strokeWidth={2.5} dot={{ r: 3 }} />
            )
          )}
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  // bar / stacked
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis {...xProps} />
        <YAxis {...yProps(leftFmt)} />
        {right.length > 0 && chart !== "stacked" && <YAxis {...yProps(rightFmt, "right", "right")} />}
        {tooltip}
        {legend}
        {series.map((s, i) => (
          <Bar
            key={s.key}
            yAxisId={chart !== "stacked" && s.axis === "right" ? "right" : "left"}
            dataKey={s.key}
            name={s.label}
            stackId={chart === "stacked" ? "a" : undefined}
            fill={COLORS[i]}
            radius={chart === "stacked" && i < series.length - 1 ? 0 : [6, 6, 0, 0]}
            maxBarSize={40}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function downloadCsv(block) {
  const header = ["Label", ...block.series.map((s) => s.label)];
  const lines = [header, ...block.rows.map((r) => [r.x, ...block.series.map((s) => r[s.key])])].map((l) => l.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(block.title || "report").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "report"}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ChartBlock({ block: raw }) {
  const block = useMemo(() => ({ ...raw, _id: Math.random().toString(36).slice(2, 8) }), [raw]);
  const [view, setView] = useState(block.chart === "table" ? "table" : "chart");
  const [full, setFull] = useState(false);

  const header = (
    <div className="flex items-start justify-between gap-2 px-3.5 pt-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{block.title}</p>
        {block.subtitle && <p className="text-xs text-muted-foreground">{block.subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-0.5 text-muted-foreground">
        {block.chart !== "table" && (
          <button type="button" title={view === "chart" ? "Show table" : "Show chart"} onClick={() => setView((v) => (v === "chart" ? "table" : "chart"))} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-muted hover:text-foreground">
            {view === "chart" ? <Table2 className="h-3.5 w-3.5" /> : <BarChart3 className="h-3.5 w-3.5" />}
          </button>
        )}
        <button type="button" title="Download CSV" onClick={() => downloadCsv(block)} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-muted hover:text-foreground">
          <Download className="h-3.5 w-3.5" />
        </button>
        <button type="button" title={full ? "Close" : "Expand"} onClick={() => setFull((f) => !f)} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-muted hover:text-foreground">
          {full ? <X className="h-4 w-4" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );

  const kpis = block.kpis?.length > 0 && (
    <div className={`grid gap-2 px-3.5 pt-3 ${block.kpis.length === 1 ? "grid-cols-1" : block.kpis.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
      {block.kpis.map((k) => {
        const up = k.delta_pct > 0;
        const has = k.delta_pct !== null && k.delta_pct !== undefined;
        return (
          <div key={k.label} className="rounded-xl border border-border bg-background/60 px-2.5 py-2">
            <p className="truncate text-[11px] text-muted-foreground">{k.label}</p>
            <p className="text-base font-bold tabular-nums sm:text-lg">{fmt(k.format, k.value)}</p>
            {has && (
              <p className={`flex items-center gap-0.5 text-[11px] font-semibold ${up ? "text-emerald-500" : k.delta_pct < 0 ? "text-rose-500" : "text-muted-foreground"}`} title={block.compare_label || ""}>
                {up ? <TrendingUp className="h-3 w-3" /> : k.delta_pct < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                {up ? "+" : ""}
                {k.delta_pct}% <span className="font-normal text-muted-foreground">{block.compare_label ? "vs prev" : ""}</span>
              </p>
            )}
          </div>
        );
      })}
    </div>
  );

  const body = block.empty ? (
    <div className="flex h-40 flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
      <BarChart3 className="h-6 w-6 opacity-50" />
      No data for this period
    </div>
  ) : view === "table" ? (
    <div className="overflow-x-auto">
      <table className="w-full text-xs sm:text-sm">
        <thead>
          <tr className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 text-left font-semibold"> </th>
            {block.series.map((s) => (
              <th key={s.key} className="whitespace-nowrap px-3 py-2 text-right font-semibold">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((r, i) => (
            <tr key={i} className="border-t border-border/60">
              <td className="px-3 py-1.5">{r.x}</td>
              {block.series.map((s) => (
                <td key={s.key} className="px-3 py-1.5 text-right tabular-nums">
                  {fmt(s.format, r[s.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <div className="px-1.5 pb-1 pt-3 text-muted-foreground sm:px-3">
      <ChartBody block={block} height={full ? 420 : 250} />
    </div>
  );

  const card = (
    <div className={`overflow-hidden rounded-2xl border border-border bg-card shadow-sm ${full ? "" : "ai-pop-in"}`}>
      {header}
      {kpis}
      <div className="pb-3">{body}</div>
      {block.footer && <p className="border-t border-border px-3.5 py-2 text-xs text-muted-foreground">{block.footer}</p>}
    </div>
  );

  if (full) {
    return (
      <>
        <div className="h-24 rounded-2xl border border-dashed border-border" />
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-8" onClick={() => setFull(false)}>
          <div className="w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
            {card}
          </div>
        </div>
      </>
    );
  }
  return card;
}
