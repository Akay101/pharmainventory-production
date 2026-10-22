import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Minus, Plus, RefreshCw, ScanLine, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { compressForScan, scanPackForBilling, scanErrorMessage } from "./scanClient";
import { ConfidencePill, MatchBadge, PhotoTray, ScanningView, useScanSteps } from "./ScanUI";
import { formatExpiry } from "../../pages/utils";
import BatchPicker from "../BatchPicker";

const STEPS = ["Optimising photo", "Reading pack with AI", "Matching your stock (batch → name)"];
const newCard = () => ({ id: `scan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, photos: [], status: "draft", result: null, item: null });

const money = (n) => `₹${(Number(n) || 0).toFixed(2)}`;

// Bill line built from a scan result; editable afterwards
function itemFromResult(data) {
  const m = data.matched_item || {};
  return {
    inventory_id: m.inventory_id || null,
    product_id: m.product_id || null,
    product_name: m.product_name || "Scanned medicine",
    salt_composition: m.salt_composition || "",
    batch_no: m.batch_no || "",
    expiry_date: m.expiry_date || "",
    available_quantity: m.available_quantity || 0,
    mrp: Number(m.mrp) || 0,
    purchase_price: Number(m.purchase_price) || 0,
    cgst: Number(m.cgst) || 0,
    sgst: Number(m.sgst) || 0,
    units_per_pack: m.units_per_pack || 1,
    hsn_no: m.hsn_no || "",
    available_batches: m.available_batches || [],
    quantity: 1,
    match_type: data.match_type || m.match_type || "negative_billing",
  };
}

// Shape BillingPage expects when scanned lines are handed over
export function toBillLines(cards) {
  return cards
    .filter((c) => c.status === "done" && c.item)
    .map(({ item }) => ({
      inventory_id: item.inventory_id || "",
      product_name: item.product_name,
      salt_composition: item.salt_composition,
      batch_no: item.batch_no,
      quantity: item.quantity,
      available_quantity: item.available_quantity,
      mrp: item.mrp,
      unit_price: item.mrp,
      purchase_price: item.purchase_price,
      cgst: item.cgst,
      sgst: item.sgst,
      expiry_date: item.expiry_date ? formatExpiry(item.expiry_date) : "",
      units_per_pack: item.units_per_pack,
      hsn_no: item.hsn_no,
      available_batches: item.available_batches,
      match_type: item.match_type,
      is_negative_billed: !item.inventory_id,
    }));
}

function ScanCard({ card, index, onUpdate, onRemove, onScan, canRemove }) {
  const step = useScanSteps(card.status === "scanning", [400, 2000]);
  const item = card.item;

  const setItem = (patch) => onUpdate({ item: { ...item, ...patch } });
  const pickBatch = (id) => {
    const b = item.available_batches.find((x) => x.id === id);
    if (!b) return;
    setItem({
      inventory_id: b.id,
      batch_no: b.batch_no,
      expiry_date: b.expiry_date,
      available_quantity: b.available_quantity,
      mrp: b.mrp || item.mrp,
      purchase_price: b.purchase_price,
      cgst: b.cgst,
      sgst: b.sgst,
    });
  };

  if (card.status === "scanning") {
    return <ScanningView photo={card.photos[0]?.preview} steps={STEPS} active={step} subtitle={`Product ${index + 1}`} />;
  }

  if (card.status === "done" && item) {
    const over = item.inventory_id && item.quantity > item.available_quantity;
    return (
      <div className="rounded-2xl border border-border bg-card p-3 sm:p-4 shadow-sm ai-pop-in">
        <div className="flex items-start gap-3">
          {card.photos[0] && <img src={card.photos[0].preview} alt="" className="h-14 w-14 rounded-xl object-cover border border-border shrink-0" />}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <MatchBadge type={item.match_type} />
              <ConfidencePill value={card.result?.confidence || card.result?.extracted_data?.confidence} />
            </div>
            {item.inventory_id ? (
              <p className="mt-1 font-semibold text-sm sm:text-base leading-tight truncate">{item.product_name}</p>
            ) : (
              <input
                value={item.product_name}
                onChange={(e) => setItem({ product_name: e.target.value })}
                className="mt-1 w-full bg-transparent font-semibold text-sm sm:text-base border-b border-dashed border-border focus:border-orange-500 outline-none"
              />
            )}
            {item.salt_composition && <p className="text-[11px] text-muted-foreground truncate">{item.salt_composition}</p>}
          </div>
          <div className="flex shrink-0 gap-1">
            <button type="button" onClick={() => onUpdate({ status: "draft", item: null, result: null })} className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground" title="Rescan">
              <RefreshCw className="h-4 w-4" />
            </button>
            {canRemove && (
              <button type="button" onClick={onRemove} className="h-8 w-8 rounded-lg hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive" title="Remove">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="col-span-2">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Batch</label>
            {item.available_batches.length > 0 ? (
              <div className="mt-0.5">
                <BatchPicker
                  batches={item.available_batches}
                  value={item.inventory_id}
                  fallbackLabel={item.batch_no}
                  onSelect={pickBatch}
                  triggerClassName="h-9 w-full text-sm"
                />
              </div>
            ) : (
              <input
                value={item.batch_no}
                onChange={(e) => setItem({ batch_no: e.target.value.toUpperCase() })}
                placeholder="Batch"
                className="mt-0.5 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm font-mono"
              />
            )}
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Qty (units)</label>
            <div className="mt-0.5 flex h-9 items-center rounded-lg border border-border bg-background">
              <button type="button" className="h-full px-2 text-muted-foreground hover:text-foreground" onClick={() => setItem({ quantity: Math.max(1, item.quantity - 1) })}>
                <Minus className="h-3.5 w-3.5" />
              </button>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={item.quantity}
                onChange={(e) => setItem({ quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                className="w-full min-w-0 bg-transparent text-center text-sm font-semibold outline-none"
              />
              <button type="button" className="h-full px-2 text-muted-foreground hover:text-foreground" onClick={() => setItem({ quantity: item.quantity + 1 })}>
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            {item.units_per_pack > 1 && (
              <button type="button" onClick={() => setItem({ quantity: item.units_per_pack })} className="mt-1 text-[10px] font-semibold text-orange-500 hover:underline">
                Full pack ({item.units_per_pack})
              </button>
            )}
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">MRP / unit</label>
            {item.inventory_id ? (
              <p className="mt-0.5 h-9 flex items-center text-sm font-semibold">{money(item.mrp)}</p>
            ) : (
              <input
                type="number"
                inputMode="decimal"
                value={item.mrp}
                onChange={(e) => setItem({ mrp: parseFloat(e.target.value) || 0 })}
                className="mt-0.5 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm"
              />
            )}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className={`flex items-center gap-1 ${!item.inventory_id || over ? "text-amber-500" : "text-muted-foreground"}`}>
            {(!item.inventory_id || over) && <AlertTriangle className="h-3.5 w-3.5" />}
            {!item.inventory_id
              ? "Not in your stock: billed as negative stock"
              : over
              ? `Only ${item.available_quantity} in this batch`
              : `${item.available_quantity} in stock${item.expiry_date ? ` · exp ${formatExpiry(item.expiry_date)}` : ""}`}
          </span>
          <span className="font-bold text-sm">{money(item.mrp * item.quantity)}</span>
        </div>
        {card.result?.alternatives?.length > 0 && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Also similar in stock: {card.result.alternatives.map((a) => a.product_name).join(", ")}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-3 sm:p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground">
          Product {index + 1}
          {card.status === "error" && <span className="ml-2 text-destructive">Couldn't read it. Try a clearer photo.</span>}
        </p>
        {canRemove && (
          <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-destructive" title="Remove">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      <PhotoTray
        photos={card.photos}
        max={4}
        onAdd={async (files) => {
          const compressed = await Promise.all(files.map((f) => compressForScan(f, { maxSide: 1600 })));
          const photos = [...card.photos, ...compressed.map((file) => ({ file, preview: URL.createObjectURL(file) }))];
          onUpdate({ photos });
          onScan(photos);
        }}
        onRemove={(i) => onUpdate({ photos: card.photos.filter((_, idx) => idx !== i) })}
        hint="Show the side with the batch number and MRP. It scans as soon as you take the photo."
      />
      {card.photos.length > 0 && (
        <button
          type="button"
          onClick={() => onScan(card.photos)}
          className="mt-2 w-full h-10 rounded-xl bg-gradient-to-r from-orange-500 to-pink-500 text-white text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.99]"
        >
          <ScanLine className="h-4 w-4" /> Scan again
        </button>
      )}
    </div>
  );
}

// List of product scans for a bill. Each photo is read and matched to stock
// as soon as it's added; the parent receives the ready bill lines.
export default function BillingScanWorkspace({ onLinesChange }) {
  const [cards, setCards] = useState(() => [newCard()]);
  const controllers = useRef({});

  useEffect(() => {
    onLinesChange?.(toBillLines(cards), cards);
    // eslint-disable-next-line
  }, [cards]);

  useEffect(
    () => () => {
      Object.values(controllers.current).forEach((c) => c.abort());
    },
    []
  );

  const update = (id, patch) => setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const scan = async (id, photos) => {
    if (!photos.length) return;
    controllers.current[id]?.abort();
    const ctrl = new AbortController();
    controllers.current[id] = ctrl;
    update(id, { status: "scanning" });
    try {
      const data = await scanPackForBilling(photos.map((p) => p.file), { signal: ctrl.signal });
      update(id, { status: "done", result: data, item: itemFromResult(data) });
      // Keep a fresh empty card ready for the next product
      setCards((prev) => (prev.some((c) => c.status === "draft" && c.photos.length === 0) ? prev : [...prev, newCard()]));
    } catch (err) {
      const msg = scanErrorMessage(err);
      if (!msg) return;
      update(id, { status: "error" });
      toast.error(msg);
    } finally {
      delete controllers.current[id];
    }
  };

  const remove = (id) => {
    controllers.current[id]?.abort();
    setCards((prev) => {
      const next = prev.filter((c) => c.id !== id);
      return next.length ? next : [newCard()];
    });
  };

  return (
    <div className="space-y-3">
      {cards.map((card, i) => (
        <ScanCard
          key={card.id}
          card={card}
          index={i}
          canRemove={cards.length > 1 || card.status === "done"}
          onUpdate={(patch) => update(card.id, patch)}
          onRemove={() => remove(card.id)}
          onScan={(photos) => scan(card.id, photos)}
        />
      ))}
      <button
        type="button"
        onClick={() => setCards((prev) => [...prev, newCard()])}
        className="w-full h-11 rounded-2xl border border-dashed border-border text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-orange-500/50 flex items-center justify-center gap-2"
      >
        <Plus className="h-4 w-4" /> Add another product
      </button>
    </div>
  );
}
