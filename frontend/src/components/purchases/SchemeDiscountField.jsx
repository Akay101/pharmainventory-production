// Scheme discount on a purchase line: the amount plus a visible % / ₹ switch.
// Typing % (or p) and ₹ (or r) in the box also switches it.
export default function SchemeDiscountField({ id, testId, value, type, onValue, onType, onEnter, active = false, className = "", height = "h-8" }) {
  const option = (kind, label, name) => (
    <button
      type="button"
      tabIndex={-1}
      data-testid={testId ? `${testId}-${kind}` : undefined}
      aria-pressed={type === kind}
      aria-label={name}
      title={name}
      onClick={() => onType(kind)}
      className={`h-full w-[22px] rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
        type === kind ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:bg-background hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div
      className={`flex ${height} min-w-0 items-center rounded-lg border bg-background transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 ${
        active ? "border-emerald-500 bg-emerald-500/10" : "border-border"
      } ${className}`}
    >
      <input
        id={id}
        data-testid={testId}
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        value={value ?? ""}
        onChange={(e) => onValue(e.target.value)}
        onKeyDown={(e) => {
          const toPct = e.key === "%" || (e.shiftKey && e.code === "Digit5") || e.key === "p" || e.key === "P";
          const toAmt = e.key === "₹" || e.key === "r" || e.key === "R";
          if (toPct || toAmt) {
            e.preventDefault();
            onType(toPct ? "percent" : "amount");
          } else if (e.key === "Enter" && onEnter) {
            e.preventDefault();
            onEnter();
          }
        }}
        placeholder="Disc"
        title="Scheme discount: a % of the line, or ₹ off it"
        className="h-full w-full min-w-0 bg-transparent px-1 text-center text-xs font-semibold text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground"
      />
      <div className="mr-[3px] flex h-[calc(100%-6px)] shrink-0 items-center gap-px rounded-md bg-muted p-px" role="group" aria-label="Scheme discount in percent or rupees">
        {option("percent", "%", "Percent of the line")}
        {option("amount", "₹", "Rupees off the line")}
      </div>
    </div>
  );
}
