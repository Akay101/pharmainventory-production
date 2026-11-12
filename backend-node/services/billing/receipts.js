// Emails about DavaDesk's own billing: payment received (with the GST
// invoice attached) and add-on / plan expiry notices.
const { sendEmail, renderBaseLayout, EmailComponents, getAssetUrls, escapeHtml, BRAND_CONFIG } = require("../email");
const invoices = require("./invoices");

const rs = (paise) => `₹${((Number(paise) || 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }) : "-");

async function ownerOf(db, order) {
  const byId = order.user_id ? await db.collection("users").findOne({ id: order.user_id }, { projection: { _id: 0, id: 1, name: 1, email: 1, is_primary_admin: 1 } }) : null;
  if (byId?.email) return byId;
  return db.collection("users").findOne({ pharmacy_id: order.account_id || order.pharmacy_id, is_primary_admin: true }, { projection: { _id: 0, id: 1, name: 1, email: 1 } });
}

function paymentCopy(order, result, firstPlan) {
  if (order.purpose === "CREDITS") {
    return { subject: "Payment received: DavaDesk AI credits", badge: "Payment received", title: "Your AI credits are ready", intro: `We've added ${order.pack_snapshot?.credits || ""} AI credits to your pharmacy.` };
  }
  if (order.purpose === "ADDON") {
    const a = order.addon || {};
    const what = a.type === "PHARMACY" ? (a.renew_addon_id ? "Your linked pharmacy has been renewed." : `${a.pharmacy?.name || "Your new pharmacy"} is now linked to your account. Switch to it from the pharmacy name at the top left.`) : a.renew_addon_id ? "Your pharmacist user has been renewed." : `${a.quantity} extra pharmacist user${a.quantity > 1 ? "s are" : " is"} now available. Add them from Users.`;
    return { subject: "Payment received: DavaDesk add-on", badge: "Add-on active", title: "Your add-on is active", intro: what };
  }
  const ends = result?.subscription?.ends_at;
  if (firstPlan) {
    return {
      subject: `Welcome to ${order.plan_snapshot?.name || "DavaDesk"}: your plan is active`,
      badge: "Welcome aboard",
      title: "Your DavaDesk plan is active",
      intro: `Thank you for choosing DavaDesk. Every feature is unlocked for your pharmacy${ends ? ` until ${day(ends)}` : ""}: billing, purchases, inventory, the desktop app with automatic cloud sync, a pharmacist user with access management and 20 AI credits every day.`,
    };
  }
  return { subject: "Payment received: DavaDesk plan renewed", badge: "Payment received", title: "Your plan is renewed", intro: `Your DavaDesk plan is active${ends ? ` until ${day(ends)}` : ""}.` };
}

async function sendPaymentEmail(db, order, invoice, result) {
  const owner = await ownerOf(db, order);
  if (!owner?.email) return false;
  const firstPlan = !order.purpose && (await db.collection("payment_orders").countDocuments({ account_id: order.account_id || order.pharmacy_id, purpose: { $in: [null] }, status: "PAID", activated: true, order_id: { $ne: order.order_id }, amount_paise: { $gt: 0 } })) === 0;
  const copy = paymentCopy(order, result, firstPlan);
  const rows = [
    { label: "Amount paid", value: `<strong style="color:#ff751f">${rs(order.amount_paise)}</strong>${order.amount_paise > 0 ? " (incl. GST)" : ""}` },
  ];
  if (invoice) {
    rows.push({ label: "Taxable value", value: rs(invoice.taxable_paise) });
    rows.push({ label: invoice.type === "INTRA" ? `CGST + SGST (${invoice.gst_percent}%)` : `IGST (${invoice.gst_percent}%)`, value: rs(invoice.gst_paise) });
    rows.push({ label: "Invoice number", value: escapeHtml(invoice.invoice_no) });
  }
  if (result?.subscription?.ends_at) rows.push({ label: "Valid until", value: day(result.subscription.ends_at) });
  rows.push({ label: "Order ID", value: escapeHtml(order.order_id) });

  const assetUrls = await getAssetUrls();
  const contentHtml = `
    <p style="margin: 0 0 16px 0; color: #334155;">${escapeHtml(copy.intro)}</p>
    ${EmailComponents.infoCard("Payment details", rows)}
    ${invoice ? `<p style="margin: 16px 0; color: #334155;">Your GST tax invoice is attached to this email. You can also download it any time from Settings, Billing &amp; plan.</p>` : ""}
    <div style="text-align: center;">${EmailComponents.button("Open DavaDesk", BRAND_CONFIG.websiteUrl, "#ff751f")}</div>
  `;
  const htmlContent = renderBaseLayout({ previewText: copy.intro, badge: copy.badge, title: copy.title, greeting: `Hello ${escapeHtml(owner.name) || "there"},`, contentHtml, assetUrls });
  const attachments = [];
  if (invoice) {
    const pdf = await invoices.ensurePdf(db, invoice);
    attachments.push({ filename: `DavaDesk-Invoice-${invoice.invoice_no.replace(/\//g, "-")}.pdf`, content: pdf, contentType: "application/pdf" });
  }
  const ok = await sendEmail({ toEmail: owner.email, toName: owner.name, subject: copy.subject, htmlContent, attachments });
  if (invoice) {
    await db.collection(invoices.INVOICES).updateOne(
      { id: invoice.id },
      { $push: { emails: { to: owner.email, at: new Date(), ok: !!ok, kind: "AUTO" } }, ...(ok ? { $set: { emailed_at: new Date() } } : { $inc: { email_failures: 1 } }) }
    );
  }
  return ok;
}

// Re-send an invoice (owner from the app, or the admin panel)
async function resendInvoice(db, invoice, { to = null, by = "OWNER" } = {}) {
  const owner = to ? { email: to, name: invoice.buyer?.contact_name || "" } : await ownerOf(db, { user_id: invoice.user_id, account_id: invoice.account_id });
  if (!owner?.email) return false;
  const pdf = await invoices.ensurePdf(db, invoice);
  const assetUrls = await getAssetUrls();
  const contentHtml = `
    <p style="margin: 0 0 16px 0; color: #334155;">Here is a copy of your DavaDesk GST tax invoice.</p>
    ${EmailComponents.infoCard("Invoice", [
      { label: "Invoice number", value: escapeHtml(invoice.invoice_no) },
      { label: "Date", value: day(invoice.issued_at) },
      { label: "Total (incl. GST)", value: rs(invoice.total_paise) },
    ])}
  `;
  const htmlContent = renderBaseLayout({ previewText: `Invoice ${invoice.invoice_no}`, badge: "Tax invoice", title: "Your invoice", greeting: `Hello ${escapeHtml(owner.name) || "there"},`, contentHtml, assetUrls });
  const ok = await sendEmail({
    toEmail: owner.email,
    toName: owner.name,
    subject: `DavaDesk tax invoice ${invoice.invoice_no}`,
    htmlContent,
    attachments: [{ filename: `DavaDesk-Invoice-${invoice.invoice_no.replace(/\//g, "-")}.pdf`, content: pdf, contentType: "application/pdf" }],
  });
  await db.collection(invoices.INVOICES).updateOne({ id: invoice.id }, { $push: { emails: { to: owner.email, at: new Date(), ok: !!ok, kind: by } } });
  return ok;
}

// Expiry reminder / notice for one item
async function sendExpiryEmail(db, { owner, itemLabel, endsAt, expired, daysLeft }) {
  if (!owner?.email) return false;
  const assetUrls = await getAssetUrls();
  const title = expired ? `${itemLabel} has expired` : `${itemLabel} expires ${daysLeft <= 1 ? "tomorrow" : `in ${daysLeft} days`}`;
  const message = expired
    ? `${itemLabel} ended on ${day(endsAt)}, so it is switched off for now. Your records are safe: renew from Settings, Billing & plan to turn it back on.`
    : `${itemLabel} ends on ${day(endsAt)}. Renew before then from Settings, Billing & plan to keep it running without a break.`;
  const contentHtml = `
    <p style="margin: 0 0 16px 0; color: #334155;">${escapeHtml(message)}</p>
    ${EmailComponents.infoCard("Details", [
      { label: "Item", value: escapeHtml(itemLabel) },
      { label: expired ? "Ended on" : "Ends on", value: day(endsAt) },
    ])}
    <div style="text-align: center;">${EmailComponents.button("Renew now", `${BRAND_CONFIG.websiteUrl}/settings?tab=billing`, "#ff751f")}</div>
  `;
  const htmlContent = renderBaseLayout({ previewText: message, badge: expired ? "Expired" : "Renewal reminder", title, greeting: `Hello ${escapeHtml(owner.name) || "there"},`, contentHtml, assetUrls });
  return sendEmail({ toEmail: owner.email, toName: owner.name, subject: `DavaDesk: ${title}`, htmlContent });
}

module.exports = { sendPaymentEmail, resendInvoice, sendExpiryEmail };
