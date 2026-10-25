// AI credits: config (prices, plans), meter (what a request used), wallet
// (balances and ledger), policy (what a request may do).
const config = require("./config");
const meter = require("./meter");
const wallet = require("./wallet");
const policy = require("./policy");

/**
 * Charge a pharmacy for what a finished request used. Idempotent on `ref`.
 * Returns { credits, cost_inr, wallet } (credits charged, 1 decimal).
 */
async function settle(db, pharmacy, m, { ref, task, engine, userId, label = "", free = false }) {
  const cfg = await config.getConfig(db);
  const sum = meter.summarize(cfg, m);
  if (!sum.calls) return { credits: 0, cost_inr: 0, wallet: null };
  if (free) {
    // Not charged; logged so the admin panel can see what light mode costs
    await db
      .collection(wallet.LEDGER)
      .insertOne({ id: require("crypto").randomUUID(), ref, pharmacy_id: pharmacy.id, user_id: userId, type: "FREE_USAGE", amount_milli: 0, task, engine, status: "DONE", meta: { label, cost_inr: Math.round(sum.inr * 1e4) / 1e4, models: sum.models }, created_at: new Date() })
      .catch(() => {});
    await wallet.addIncludedCost(db, pharmacy, sum.inr * 100).catch((err) => console.error("[credits] light mode cost:", err.message));
    return { credits: 0, cost_inr: sum.inr, wallet: null, free: true };
  }
  const milli = config.creditsForInr(cfg, sum.inr);
  const r = await wallet.charge(db, cfg, pharmacy, {
    milli,
    ref,
    userId,
    task,
    engine,
    costPaise: sum.inr * 100,
    meta: {
      label,
      cost_usd: Math.round(sum.usd * 1e6) / 1e6,
      cost_inr: Math.round(sum.inr * 1e4) / 1e4,
      usd_inr: cfg.usd_inr,
      margin_percent: cfg.margin_percent,
      models: sum.models.map((x) => ({ ...x, usd: Math.round(x.usd * 1e6) / 1e6 })),
      fallback: m.entries.some((e) => e.fallback),
      estimated: m.entries.some((e) => e.estimated),
    },
  });
  return { credits: wallet.toCredits(milli), cost_inr: sum.inr, wallet: r.wallet || null, duplicate: r.duplicate };
}

module.exports = { config, meter, wallet, policy, settle };
