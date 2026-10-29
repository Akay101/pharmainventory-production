#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Auth hardening: staged signup, hashed OTPs, rotating refresh tokens, lockouts, forgot password"
##     - "Pharmacy-level subscriptions, admin-managed pricing, promo/discount codes, free trial, Cashfree checkout"
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

## user_problem_statement: "Duplicate product entries in inventory when batch details change. Need unique product grouping in search/billing suggestions, inline batch dropdown selection in billing, and an inventory merge feature to safely consolidate existing duplicates without breaking history."
## backend:
##   - task: "Product catalog lookup/creation in Purchases"
##     implemented: true
##     working: true
##     file: "backend-node/routes/purchases.js"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Synchronizes products table during purchase creation/edit and links batches by product_id."
##   - task: "Purchase discount, scheme integration & PDF layout"
##     implemented: true
##     working: true
##     file: "backend-node/routes/purchases.js"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Computes unit cost price factoring in discount and free scheme items, stocks total quantity in inventory, and generates PDF containing DISC% and SCHEME columns, with optimized column widths to prevent header wrapping."
##   - task: "Grouped medicine search and suggestions"
##     implemented: true
##     working: true
##     file: "backend-node/routes/medicines.js"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Groups inventory matching items by product name, sum stock quantities, and return a nested batches array. Passed automated tests successfully."
##   - task: "Inventory Batch Merge API"
##     implemented: true
##     working: true
##     file: "backend-node/routes/inventory.js"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Handles merging multiple inventory records, consolidating duplicate batches, updating purchases and bills tables nested records, rewriting deleted inventory IDs, and cleaning up unused products. Passed automated integration tests successfully."
##   - task: "Indexed medicine search (global catalogue n-grams + tenant indexes)"
##     implemented: true
##     working: true
##     file: "backend-node/services/search/medicineSearch.js, backend-node/routes/medicines.js, backend-node/routes/inventory.js"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: true
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Replaced case-insensitive regex scans of global_medicines (~750ms, full index scan of 409K keys) with precomputed edge n-gram keys and {s_name_grams, rank_score} indexes (2-17ms). Tenant inventory/products searches are token-based and bounded by new pharmacy_id compound indexes, ensured at startup. Removed the 15-minute cache of tenant results so stock in search results is always live; only the static global layer is cached. Verified end to end on a copy of prod global_medicines: /api/medicines/search and /api/inventory/search, multi-word in any order, typos, batch-number lookup, stable pagination, text-index fallback when the catalogue is not backfilled."
##   - task: "Auth hardening: staged signup, hashed OTPs, rotating refresh tokens, lockouts, forgot password"
##     implemented: true
##     working: true
##     file: "backend-node/routes/auth.js, backend-node/services/auth/*, backend-node/middleware/auth.js, backend-node/routes/users.js, backend-node/routes/settings.js"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: true
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Signup is staged in pending_registrations until the emailed OTP is verified. OTPs are HMAC-hashed, 5 attempts, 60s resend cooldown, 5/hour, never returned in responses. Access token 15m in memory; refresh token httpOnly cookie on /api/auth, rotated each use with reuse detection. Per-IP rate limits + per-account lockout (5 failures/15m). zod validation on every auth body (blocks NoSQL operator injection and markup). Forgot/reset password via OTP revokes all sessions. Staff invites fixed (were unverifiable) and IDOR on DELETE /users fixed. 48/48 local abuse tests pass."
##   - task: "Pharmacy-level subscriptions, admin-managed pricing, promo/discount codes, free trial, Cashfree checkout"
##     implemented: true
##     working: true
##     file: "backend-node/services/billing/*, backend-node/routes/billing.js, backend-node/routes/webhook.js, backend-node/services/cron.js, backend-node/scripts/migrations/2026_10_billing.js"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: true
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Subscriptions live on pharmacies.subscription (staff inherit). Prices from the plans collection + global offer (admin panel); server-side quotes only. ACCESS and DISCOUNT promo codes with atomic reservation. 7-day trial once per pharmacy via internal trial code + email. Checkout -> payment_orders snapshot -> Cashfree order; webhook (raw body, verified signature), return-page confirm and 10-min reconcile all call one idempotent finalizeOrder. Upgrade credits unused paid days. Cron jobs use Mongo leases. Requires the migration script before deploy. Verified: 41 billing tests incl. real sandbox orders, 11 paid-path tests, 6-step real sandbox UPI payment (PENDING->PAID->activated)."
##   - task: "Admin: pricing, offers, trial settings, promo types, subscription extend/end/grant"
##     implemented: true
##     working: true
##     file: "admin-backend/routes/pricing.js, admin-backend/routes/subscriptions.js, admin-backend/routes/promos.js"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: true
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Superadmin-only pricing writes; all subscription actions audited in admin_audit_log. 36/36 admin e2e tests on a migrated copy of dev data."
##   - task: "Returns & Expiry: shared return-note engine with stock, purchase and dues consistency"
##     implemented: true
##     working: true
##     file: "backend-node/services/returns/notes.js, backend-node/routes/returns.js, backend-node/routes/expiry.js, backend-node/routes/inventory.js, backend-node/routes/purchases.js"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: true
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "One router factory for /api/returns and /api/expiry (same endpoints). Units leave sellable stock when a note is created (partial returns supported; was: whole batch zeroed only at settlement) and go back exactly on delete. Expiry: move-batch moves expired units off the shelf into expired_quantity (expiry list), restore-batch undoes; notes take from the list first. Batches get returned_quantity and a readable stock_status (In Stock, Expired, Expired · In Expiry List, Expired · In Return Note, Expired & Returned, Expired · Partly Returned, Marked for Return, In Return Note, Returned, Partly Returned). Note lines link to the purchase lines they came from (purchase items: return_refs, returned_units, status Return Pending / Returned / Expiry Return Pending / Expired & Returned; purchase: has_returns, returned_units, returned_value; purchase edits keep the links). Credit: refund modes or 'Adjust against dues' (applied FIFO to the supplier's unpaid purchases as 'Return credit' payments; capped by what is owed). Guards: units <= available, whole units, no duplicate batch, supplier must exist, expired batches only via Expiry and vice versa, no overpayment, no delete/back-to-draft once a payment exists, settled is final, Mark settled writes the remainder as a ledger entry. Unique note numbers after deletes; activity log fixed (was called with wrong arguments). Legacy notes (no stock_v2) settle by their own units instead of zeroing. '-' / '' expiry no longer counted as expired. Verified: 52 API checks + legacy settle check on local Mongo replica set."
##   - task: "Voice typing: Groq Whisper speech-to-text, metered in AI credits"
##     implemented: true
##     working: true
##     file: "backend-node/services/assistant/stt.js, backend-node/routes/assistant.js, backend-node/services/assistant/limits.js, backend-node/services/credits/config.js, backend-node/services/credits/policy.js, admin-backend/services/credits/config.js"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: true
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "POST /api/assistant/transcribe (16 kHz WAV phrase; mode live = whisper-large-v3-turbo, final = whisper-large-v3; lang auto = English/Hinglish in Roman script, hi = Devanagari; never language=en because Whisper then translates Hindi). Prompt carries a style sample, the pharmacy's in-stock medicine names and the text said before. Drops no-speech segments and known silence hallucinations. GET /transcribe/status (credits + key) before the mic opens; POST /transcribe/finish charges the whole dictation once (ref stt:<session>, task dictation, label 'Voice typing (Ns)'); a sweeper charges sessions left open > 2 min. Billed per second (10 s minimum per request) via model_prices (input = USD per 1M seconds: large-v3 30.84, turbo 11.12). Rate limit ASSISTANT_STT_PER_MIN (90). Verified with real Groq calls: Hindi/Hinglish/English clips, closed session 409, bad audio, auth; a 13 s two-phrase dictation = 8 calls, 1.5 credits."
##   - task: "UPI QR for any amount + assistant tool"
##     implemented: true
##     working: true
##     file: "backend-node/utils/upi.js, backend-node/routes/pharmacy.js, backend-node/services/assistant/tools/app.js, backend-node/services/assistant/agents.js"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: true
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "upi_id already existed on the pharmacy; now validated on save (name@psp). GET /api/pharmacy/upi-qr?amount=&note= returns upi://pay?pa=…&pn=…&am=…&cu=INR[&tn=] (@ kept raw for app compatibility) + PNG QR; amounts ₹1-₹1,00,000, 2 decimals, ₹ and commas accepted. Assistant tool upi_payment_qr (billing + app agents) emits a qr block; missing/bad UPI ID -> card with Open Settings (admins). Verified: 15 API checks; QR decoded with the browser BarcodeDetector; 'generate a QR for ₹250' in chat."
##   - task: "Send bill on WhatsApp with secure expiring PDF link"
##     implemented: true
##     working: true
##     file: "backend-node/services/billShare.js, backend-node/routes/bills.js, backend-node/routes/public.js, backend-node/server.js"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: true
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Existing bill PDFs were permanent public R2 URLs with a guessable key, so not shared. POST /api/bills/:id/share {phone?}: random 128-bit token in bill_shares (BILL_SHARE_DAYS, default 30; reused while > 7 days left; TTL index), message (bill no, date, items, total, paid/due, UPI ID when due, link + validity), normalized number (+91/91/0 prefixes, 6-9 start, +country kept) and wa.me link. DELETE /api/bills/:id/share revokes. GET /api/public/bill/:token renders the current PDF (no login, 30/min/IP, noindex; expired/revoked -> 410 page, deleted bill -> 410). Link base: SHARE_BASE_URL, else BACKEND_URL, else request host. Verified: 16 API checks."
##   - task: "Support queries (app + admin)"
##     implemented: true
##     working: true
##     file: "backend-node/routes/support.js, admin-backend/routes/support.js, admin-backend/server.js"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: true
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "support_tickets (SUP-00001 numbering via counters). App /api/support: list with open/resolved counts, unread count, create (category bug/question/feature/billing/other, title >= 5, details >= 10, 10 per pharmacy per hour, page + browser info attached), read (clears unread), reply (reopens resolved), resolve. Works without an active subscription. Admin /api/support (requireAdminAuth, dev/prod by header): consolidated list across pharmacies with status/category/priority/search/unread filters and counts, open (pharmacy info, clears admin unread), reply (sets Replied + user unread + SUPPORT_REPLY notification with deep link) or internal note (hidden from the pharmacy), status/priority. Verified: 23 end-to-end checks across both backends."
##   - task: "50-50 Launch Offer section + 50-day codes (admin)"
##     implemented: true
##     working: true
##     file: "admin-backend/services/offerLeads.js, admin-backend/routes/offerLeads.js, admin-backend/routes/users.js, admin-backend/services/email.js, admin-frontend/src/pages/OfferLeadsPage.jsx, admin-frontend/src/pages/UsersPage.jsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: true
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Reads the website's 50-50 registrations (krishna_consultation.offerleads via OFFER_LEADS_MONGO_URL, read-only, 1-min cache). Admin /api/offer-leads: list with follow-up state (admin_leads, lead ids 'offer:<_id>', so the normal note/status/connect endpoints and LeadNotesModal work), stage NOT_SENT / CODE_READY / CODE_SENT / REGISTERED (DavaDesk user with same email or mobile) / ACTIVATED (code redeemed; plan, days left, last login). POST /:id/code: single-use 50-day ACCESS code FIFTY-XXXXXX (source OFFER_5050, plan default AGENTIC, must be applied within 30 days by default), reused while unused, regenerate cancels the old one, no new code after activation; returns an email draft (code, steps with the env's register link, misuse warnings). POST /:id/send: sends the reviewed draft via Brevo (must contain the active code; test=true sends to the signed-in admin); logged on the lead + audit log. Users API tags offer_5050 and filter=OFFER_5050. Dev and prod each keep their own codes/follow-ups (per-env DB); registrations come from the same website DB. Verified: 25 checks on a local stack incl. real redemption in the app (50 days AGENTIC) and the Users filter; UI checked in the browser."
##   - task: "Refill reminder: dose-based date calculation"
##     implemented: true
##     working: true
##     file: "frontend/src/lib/refill.js, frontend/src/pages/BillingPage.jsx, backend-node/routes/bills.js"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: true
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Per medicine in the reminder: dose per day (chips ½/1/2/3 or typed: 0.5, ½, 1½, 1 1/2) or days it lasts (syrups etc.). Days = floor(units ÷ dose); the medicine that runs out first sets the dates; reminder = run-out minus 1 day (≤7 days supply), 2 (≤30), 3 (≤60), 5 (longer), never before tomorrow. Auto mode follows doses/qty/billing date; presets or editing dates switch to custom with 'Use recommended' to go back. Reminder items store dose_per_day, days_supply, runs_out_on (sanitized server-side). Reminder state now resets after a bill. Verified: math unit tests (15 @1/day -> run out day 15, remind day 13; 15 @½ -> 30 days; 10 @1.5 -> 6), API stores 0.5 dose, browser check of auto/custom."
##   - task: "Short book"
##     implemented: true
##     working: true
##     file: "backend-node/routes/shortbook.js, backend-node/routes/bills.js, backend-node/server.js, frontend/src/pages/ShortBookPage.jsx, frontend/src/pages/BillingPage.jsx, frontend/src/components/DashboardLayout.jsx, frontend/src/App.js"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: true
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "/api/shortbook (list with stock on hand + last supplier, add from a bill line or by hand, edit qty/unit/notes/status pending->ordered->received, reopen, delete). One open entry per medicine (partial unique index): adding again merges quantity (packs/units converted via pack size) and keeps every source bill. Bill lines get a short_book mark (kept across bill edits, cleared on delete). Billing: 'Short book' button per item in an expanded bill (pre-filled with packs sold) -> green badge. Top nav 'Short Book' (Alt/⌥+O), tabs To order/Ordered/Received/All, search, inline qty edit, 'Copy order list' grouped by supplier for WhatsApp. Verified: 24 API checks incl. merge, conversion, tenancy, bill edit; UI checked in the browser."
##   - task: "Item QR labels (Purchases) + scan to bill"
##     implemented: true
##     working: true
##     file: "backend-node/services/itemLabels.js, backend-node/routes/purchases.js, backend-node/routes/inventory.js, frontend/src/components/ItemQr.jsx, frontend/src/pages/PurchasesPage.jsx, frontend/src/pages/BillingPage.jsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: true
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "POST /api/purchases/:id/labels {lines:[{line,copies}], layout a4_65|roll_50x25|roll_38x25, skip} -> label PDF at exact mm sizes (QR + name on 2 lines, batch, expiry, MRP/unit, pharmacy). QR = DD1|<inventory id>|batch|YYYY-MM|mrp|name (ECC L, 37 modules). Purchases: QR icon per purchase (row key L) and 'Print' per item; copies default to packs incl. free; layout remembered. GET /api/inventory/by-code resolves a label (pharmacy-scoped; flags expired/returned). Billing: a QR scanner typing into the product search (Enter) adds the batch line, keeps whatever the row had, and focuses quantity; 'Scan item QR' camera dialog (BarcodeDetector, jsqr fallback, manual box); the same batch twice focuses its quantity instead of a duplicate. Verified: printed QR decoded from the PDF, API checks, browser scan into empty/filled rows."
##   - task: "Bill PDF with / without UPI QR"
##     implemented: true
##     working: true
##     file: "backend-node/services/pdf.js, backend-node/routes/bills.js, frontend/src/pages/BillingPage.jsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: true
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "POST /api/bills/:id/pdf {upi_qr}: true = QR for the amount due (bill total if paid), false = none, omitted = old behaviour (QR while due). 400 NO_UPI_ID when asked without a UPI ID. Returned URL gets ?v= so the browser doesn't show the cached other version. Billing: PDF button opens a With UPI QR / Without QR choice (remembered); same choice in the post-save PDF prompt; tab opened inside the click. Verified by decoding the QR from generated PDFs (paid/due x with/without/default)."
##   - task: "Return / expiry note PDF"
##     implemented: true
##     working: true
##     file: "backend-node/services/returnNotePdf.js, backend-node/services/returns/notes.js, frontend/src/components/returns/ReturnNotesPage.jsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: true
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "GET /api/returns/:id/pdf and /api/expiry/:id/pdf: A5-landscape note in the purchase/bill frame (pharmacy + supplier header, items with batch/exp/units/packs/rate/MRP/amount/source purchase invoice, remarks, credit value/received/due, handed-over and supplier signatures, page numbers). Returns/Expiry print buttons open it (replaces the HTML print)."
## frontend:
##   - task: "Billing page batch selection dropdown"
##     implemented: true
##     working: true
##     file: "frontend/src/pages/BillingPage.jsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Renders batch dropdown for inventory items, automatically selects earliest expiry in stock (FEFO), updates pricing and totals dynamically on batch change, and handles loading batches during edit bill."
##   - task: "Inventory page merge selection UI"
##     implemented: true
##     working: true
##     file: "frontend/src/pages/InventoryPage.jsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Added checkboxes for multi-select, a Merge Selected button, and a merge configuration Dialog with warning details."
##   - task: "Revamped Purchases items input table & math sync"
##     implemented: true
##     working: true
##     file: "frontend/src/pages/PurchasesPage.jsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Redesigned items table to 9 columns, synchronized CGST/SGST, and auto-adjusted Rate per Pack when total is overridden."
##   - task: "Batch Dropdown Pagination UI and Supplier Name info"
##     implemented: true
##     working: true
##     file: "frontend/src/pages/BillingPage.jsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Displays supplier name in each batch item inside the dropdown and limits displayed items to 10 by default, offering a Show More button to load subsequent batches without closing the dropdown."
##   - task: "Database-Level Skip/Limit Pagination"
##     implemented: true
##     working: true
##     file: "backend-node/routes/inventory.js"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Replaced in-memory slicing pagination with MongoDB native skip() and limit() cursor operations, adding pagination response fields to both the list and search endpoints."
##   - task: "Product Catalog Details Popup Dialog"
##     implemented: true
##     working: true
##     file: "frontend/src/pages/InventoryPage.jsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Provides a premium modal to view all associated inventory batches of a product catalog card on click, including batch numbers, expiry dates, quantities, prices, supplier names, and status badges."
##   - task: "Catalog Merge Option inside Details Popup"
##     implemented: true
##     working: true
##     file: "frontend/src/pages/InventoryPage.jsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: false
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Added a sub-merge form toggle inside the details popup letting users select other catalog products, fetches their respective batch IDs, and merges all items in a single transaction under the target product."
##   - task: "Auth pages, in-memory session, redesigned Upgrade + payment result pages"
##     implemented: true
##     working: true
##     file: "frontend/src/App.js, frontend/src/pages/{LoginPage,RegisterPage,ForgotPasswordPage,UpgradePage,PaymentSuccessPage}.jsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: true
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Verified in browser against local backend: register with validation, OTP step with cooldown, auto sign-in, upgrade page with admin-set offer/trial/prices, live discount re-pricing, order summary, Cashfree sandbox redirect, payment result polling -> dashboard, session restore from cookie, logout, forgot password."
##   - task: "Admin Pricing & Subscriptions pages, promo generator types"
##     implemented: true
##     working: true
##     file: "admin-frontend/src/pages/{PricingPage,SubscriptionsPage,PromoCodesPage}.jsx"
##     stuck_count: 0
##     priority: "medium"
##     needs_retesting: true
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Rendered against migrated dev copy; builds pass."
##   - task: "Returns & Expiry pages (shared ReturnNotesPage)"
##     implemented: true
##     working: true
##     file: "frontend/src/components/returns/ReturnNotesPage.jsx, frontend/src/pages/ReturnsPage.jsx, frontend/src/pages/ExpiryPage.jsx, frontend/src/pages/InventoryPage.jsx, frontend/src/pages/PurchasesPage.jsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: true
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "How-it-works steps, clearer statuses (Draft · not handed over / Handed over · credit due / Part credited / Returned & settled), stock tab with server stock_status, Mark expired (single + bulk), Return, Undo, picker per supplier with 'all suppliers' option, units capped at what is available, editable credit rate, 'already handed over' option, note detail with progress, purchase links, ledger incl. dues adjustments, Record credit dialog (refund vs adjust against dues, live validation), AlertDialog confirms, printable note via hidden iframe. Inventory batch cards show the same statuses, expiry-list and returned units. Purchases list shows a Returns chip and per-line return badges with units."
##   - task: "Voice typing in the assistant (no auto-send)"
##     implemented: true
##     working: true
##     file: "frontend/src/components/assistant/useDictation.js, frontend/src/components/assistant/useVoice.js, frontend/src/pages/AssistantPage.jsx, frontend/src/components/assistant/Credits.jsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: true
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Mic starts live transcription at once and keeps going until the user stops (mic button, Enter or Esc); text lands in the box (appended to anything typed) for review; nothing is sent automatically. Live level ring, finishing spinner, Aa / हि script toggle, credit hint, 3-minute cap. Falls back to the browser recognizer (also without auto-send) when there are no credits or Whisper is unavailable; mic-blocked errors handled. Verified in the browser with a fake mic stream (two phrases with a pause): live text, finals replacing previews, no message sent."
##   - task: "UPI QR dialog (Settings, Billing, chat)"
##     implemented: true
##     working: true
##     file: "frontend/src/components/UpiQr.jsx, frontend/src/pages/SettingsPage.jsx, frontend/src/pages/BillingPage.jsx, frontend/src/components/assistant/Blocks.jsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: true
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "Settings: UPI ID validation + Generate QR. Billing: UPI QR button (Alt+Q) and per-bill QR for the amount due. Chat qr block. Download PNG and print; missing UPI ID guides admins to Settings."
##   - task: "Send on WhatsApp in Billing"
##     implemented: true
##     working: true
##     file: "frontend/src/components/ShareBillWhatsApp.jsx, frontend/src/pages/BillingPage.jsx"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: true
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "One click when the bill has a valid mobile (tab opened inside the click so pop-up blockers allow it); otherwise a dialog with +91 number field, validation and an editable message, Copy message."
##   - task: "Help & Support page + admin Support Queries page"
##     implemented: true
##     working: true
##     file: "frontend/src/pages/SupportPage.jsx, frontend/src/components/DashboardLayout.jsx, frontend/src/App.js, admin-frontend/src/pages/SupportPage.jsx, admin-frontend/src/App.jsx, admin-frontend/src/components/Sidebar.jsx, admin-frontend/src/api.js"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: true
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "App: user menu + phone More sheet entry with unread badge, Open/Resolved/All tabs, report form, conversation, mark resolved, deep link /support?ticket=. Admin: sidebar entry with unread badge, filters, list + thread (two panes on desktop, bottom drawer on phones), reply / internal note, status + priority."
##   - task: "Keyboard shortcut layer (Marg-style)"
##     implemented: true
##     working: true
##     file: "frontend/src/lib/shortcuts.js, frontend/src/components/shortcuts/Shortcuts.jsx, frontend/src/components/DashboardLayout.jsx, frontend/src/pages/BillingPage.jsx, frontend/src/pages/PurchasesPage.jsx, frontend/src/index.css"
##     stuck_count: 0
##     priority: "high"
##     needs_retesting: true
##     status_history:
##       - working: true
##         agent: "main"
##         comment: "One layer: open dialog (Cmd/Ctrl+Enter or Alt+Enter presses its Save, Esc closes) > page shortcuts > global. Fixes: Alt+S on Billing/Purchases used to open Suppliers instead of saving; Alt+A toggled the activity panel instead of adding a line (activity moved to Alt+L); Purchases AI autofill moved from Alt+I (Inventory) to Alt+G; assistant moved from Ctrl/Cmd+J (browser Downloads) to Alt+J; Esc no longer discards a bill with items without asking. Global: Alt+H/B/P/I/S/C/E/R/Y/, navigation, Alt+N new on the current page (else new bill), Alt+K or / search, Alt+L activity, ? or Alt+/ help. Lists: Tab to a row, arrows/Home/End, Enter opens, row letters (bills: E edit, P PDF, W WhatsApp, Q QR, M mark paid, Del delete; purchases E/P/Del; return notes H/C/P/Del). Letters matched by physical key (Mac Option works); Mac shows ⌥ ⌘, others Alt/Ctrl; Firefox also accepts Alt+Shift+letter. Hold Alt for badges on buttons; non-modal help panel with search; hints hidden on touch screens. After saving a bill, focus returns to New Bill."
## metadata:
##   created_by: "main_agent"
##   version: "1.4"
##   test_sequence: 5
##   run_ui: false
## test_plan:
##   current_focus:
##     - "Indexed medicine search (global catalogue n-grams + tenant indexes)"
##     - "Product catalog lookup/creation in Purchases"
##     - "Grouped medicine search and suggestions"
##     - "Inventory Batch Merge API"
##     - "Billing page batch selection dropdown"
##     - "Inventory page merge selection UI"
##     - "Batch Dropdown Pagination UI and Supplier Name info"
##     - "Database-Level Skip/Limit Pagination"
##     - "Product Catalog Details Popup Dialog"
##     - "Catalog Merge Option inside Details Popup"
##     - "Purchase discount, scheme integration & PDF layout"
##     - "Revamped Purchases items input table & math sync"
##     - "Returns & Expiry: shared return-note engine with stock, purchase and dues consistency"
##     - "Returns & Expiry pages (shared ReturnNotesPage)"
##     - "Voice typing: Groq Whisper speech-to-text, metered in AI credits"
##     - "Voice typing in the assistant (no auto-send)"
##     - "UPI QR for any amount + assistant tool"
##     - "Send bill on WhatsApp with secure expiring PDF link"
##     - "Support queries (app + admin)"
##     - "Keyboard shortcut layer (Marg-style)"
##     - "50-50 Launch Offer section + 50-day codes (admin)"
##     - "Refill reminder: dose-based date calculation"
##     - "Short book"
##     - "Item QR labels (Purchases) + scan to bill"
##     - "Bill PDF with / without UPI QR"
##     - "Return / expiry note PDF"
##   stuck_tasks: []
##   test_all: true
##   test_priority: "high_first"
## agent_communication:
##   - agent: "main"
##     message: "Successfully implemented discount percentage and scheme quantity math calculations, revamped the purchases table layout into a clean 9-column format, fixed the missing JSX conditional closing tags syntax error, successfully verified build compile, and passed integration calculations unit test."
##   - agent: "main"
##     message: "Medicine search re-architected for speed: new services/search (normalize, medicineSearch, indexes). Global catalogue needs a one-time backfill per database: node backend-node/scripts/search/backfill_global_medicines.js. Response shapes of /medicines/search and /inventory/search are unchanged; please retest Purchases item search and Billing product search, including batch-number search and stock shown immediately after a sale."
##   - agent: "main"
##     message: "Auth + billing redesign. Run backend-node/scripts/migrations/2026_10_billing.js (--dry-run first) on each environment BEFORE deploying the new backend. Everyone is signed out once (new token format). Retest: signup/OTP/login/forgot password, free trial, staff invite + staff access, upgrade page with offers and codes, Cashfree checkout + return page, admin Pricing/Subscriptions/Promo pages."
##   - agent: "main"
##     message: "Inventory/Purchase/Billing stock integrity (services/stock.js). Purchase edit now applies per-batch differences: price/expiry/GST edits work after partial sales; reducing below sold units returns 409 STOCK_CONSUMED with details. Purchase delete: GET /purchases/:id/stock-impact preview; delete_inventory=true refused if stock sold, new delete_inventory=unsold removes only shelf stock. Bill lines record stock_deducted so edit/delete give back exactly what was taken (negative billing no longer inflates stock). Bill line totals computed server-side (qty x MRP less discount); bill edits keep recorded part-payments; bill numbers in IST and unique per pharmacy. New bill PDF (MRP, pack/loose qty, per-line discount, totals breakdown, savings, GST included, real UPI QR). Inventory search fix: 'dolo 650mg' now matches 'Dolo 650mg'. Retest: purchase edit/delete after a sale, bill create/edit/delete stock, oversell then delete, credit bill part-payment then edit, bill PDF, Purchases suggestion groups, Billing customer filter."
##   - agent: "main"
##     message: "AI scanning rebuilt (services/ai/*). Node-only Gemini client (default GEMINI_SCAN_MODEL=gemini-3.5-flash, fallback GEMINI_FALLBACK_MODEL=gemini-2.5-flash, thinking minimal, JSON schema, retries + request hedging). Images resized once (sharp), duplicates dropped, results cached 15 min. Purchase scans queued to the Node worker (WORKER_CONCURRENCY, GEMINI_JOBS_PER_MIN) with images in the job, long-poll status (?wait=1). Billing /bills/scan-product inline: batch (exact, then OCR look-alikes, name must agree) -> name (brand+strength, earliest valid batch) -> negative billing; returns the product's sellable batches. Limits via Redis: SCAN_USER_PER_MIN (30), SCAN_PHARMACY_PER_DAY (1500), SCAN_PHARMACY_INFLIGHT (5). Invoice scan now reads pack size, free qty, discount, GST, invoice date, supplier GSTIN. New UI: ScannerPage, BillingScannerPage, BillingScannerModal (now opened from the new-bill form). Retest: scan packs/invoice on a phone, create purchase from invoice, billing scan -> open bill/draft, modal add-to-bill."
##   - agent: "main"
##     message: "DavaDesk AI assistant (replaces /api/chat + AgentWidget). Backend services/assistant: router (gemini-3.1-flash-lite) picks one of 7 micro-agents (purchase, billing, inventory, customer, supplier, app, medi) and the language (en/hinglish/hi); each agent runs a native Gemini function-calling loop (ASSISTANT_MODEL, default gemini-3.5-flash) over pharmacy-scoped read tools, streamed over SSE (POST /api/assistant/chat). Writes are drafts/confirm cards; Save/confirm buttons execute server-side through the app's own API with single-use nonces and a per-chat Redis lock. Chats in assistant_conversations/assistant_messages with 30-day TTL. Limits: ASSISTANT_USER_PER_MIN (20), ASSISTANT_PHARMACY_PER_DAY (2000). Frontend: full-screen /assistant page (sidebar, voice input hi-IN/en-IN, read aloud, tables/charts/stats/draft/confirm/choice blocks), floating launcher (Ctrl/Cmd+J). Retest: Hinglish purchase creation end to end, data questions per module, intent switching, Hindi replies, delete/payment confirmations, chat rename/pin/delete."
##   - agent: "main"
##     message: "Assistant voice + photos. Spoken turns (mic) get a spoken reply in a natural Gemini voice (POST /api/assistant/tts streams 24 kHz PCM; ASSISTANT_TTS_MODEL default gemini-3.8-flash-tts, ASSISTANT_TTS_VOICE default Kore; typed turns stay silent). Photos: attach/paste/drag up to 4 images in the composer; /api/assistant/chat accepts multipart. Agent photo tools: read_invoice_photo (purchase draft from a supplier invoice), read_product_photo_for_purchase, read_product_photo (adds pack to bill, batch then name), identify_product_photo (inventory/medi). Photos kept 1 h per chat in Redis for follow-ups. Retest: mic question gets spoken answer, invoice photo -> purchase draft -> save, pack photo -> bill, pack photo -> identify."
##   - agent: "main"
##     message: "Assistant analytics: build_report tool (sales/purchases/stock; metrics, day/week/month/weekday/hour/product/customer/payment_mode/doctor/supplier/manufacturer/expiry groupings, filters, top-N, compare_previous with dashed previous-period overlay) and show_chart, available to all module agents; several calls per turn make a dashboard. New ChartBlock renders line/area/bar/hbar/stacked/donut/combo with KPI deltas, table toggle, CSV download, full screen. purchase_insights removed and sales_report reduced to totals. Retest: 'sales ka graph', 'is mahine ka dashboard', 'pichhle hafte se compare', top customers/medicines, stock by manufacturer."
##   - agent: "main"
##     message: "Phone layout (below 768px only; tablet/desktop unchanged). Bottom tab bar (Home, Billing, Scan chooser, Purchases, More sheet with the rest + AI + activity + logout) replaces the hamburger; it hides while typing and while a create/edit Save bar is on screen. Header: pharmacy name + AI button. Tables with mobileCards (bills, purchases, inventory, customers, expiry, returns, users, reports, new/edit bill and purchase item rows, expanded items) render each row as a labelled card. Dialogs/alert dialogs open as bottom sheets. Product/batch suggestion dropdowns span the screen. Save bars wrap to two rows. Stat tiles 2-up. Scan buttons open in the same tab on phones. viewport-fit=cover + safe areas. Retest at 375px: login, nav + More/Scan sheets, create bill (search, batch, qty, save), create purchase, edit bill, delete dialog, lists on every page, notifications."
##   - agent: "main"
##     message: "Assistant voice consistency + mobile mic. Root cause of the occasional male/different voice: gemini-3.8-flash-tts allows 100 requests/day on this key; any error (incl. that 429) fell through to older TTS models whose Kore sounds different. Now one model only (switch only on 404), per-minute 429/5xx retry the same model, daily quota pauses voice until reset (app shows a one-time notice). Each take's pitch is checked on its first 1.6 s (services/assistant/pitch.js, band 172-240 Hz, env ASSISTANT_TTS_PITCH_MIN/MAX); drifted takes are regenerated with another seed before anything plays. Mic: auto-sends after 1.5 s of silence on phones too (Android Chrome / iOS Safari never ended the turn), and sends interim words. Retest: several spoken replies in Hindi/Hinglish/English sound like one voice; on a phone, speak and pause -> message sends by itself."
##   - agent: "main"
##     message: "Assistant purchase flow = manual purchase flow (typed, voice, photo). Names cleaned of invoice pack text (OXALGIN-DP TAB 20S . -> Oxalgin-DP Tab) before matching; each line: catalog (incl. same medicine under another spelling via medicineKey) -> global medicine DB (name/maker/pack from there) -> picker card. Picker card (block type picker) shows closest catalog + medicine-DB matches (or your suppliers + distributors), a search box (GET /api/assistant/lookup) and 'Add as new'; a pick updates the draft directly (op resolve_purchase_line, no AI turn). Suppliers: Hindi names converted to English, sound-alike match against own suppliers (Nilkanth -> Neelkanth). Billing/purchase search no longer lists a global medicine that is already in the catalog under another spelling. Assistant chat uses more width on desktop. Retest: invoice photo with caps/pack-count names, Hindi voice purchase with known supplier, picker pick + add new, billing search for an invoice-named item."
##   - agent: "main"
##     message: "Purchase drafts + assistant robustness. purchase_drafts (GET/POST/PUT/DELETE /api/purchases/drafts; POST /api/purchases with draft_id removes it). Purchases page: Drafts list, Review & save, Save as draft / Update draft. Scanner: Save draft. Assistant: Save as draft button (recommended for photo/voice), save_purchase_as_draft tool. Matching: auto-pick from the medicine DB only on exact brand+variant words, equal strengths (decimals kept, ml/gm pack sizes ignored) and form; variant markers (DS/SR/Forte/D) count. Medicine DB unreachable -> 'couldn't check' instead of 'not found', picker banner, no push to add new. Lines resolved in parallel. Picker: loading/skeleton, retry, restores own matches, undo on failed pick, prefix fallback, sound-alike supplier prefix. Cards locked while a reply streams; failed save no longer shows Saved. Particle loader while thinking/streaming. Retest: invoice with DS/2.5/D variants, DB offline, save draft by button and by words, picker search."
##   - agent: "main"
##     message: "AI credits + cost architecture. services/credits (config: model prices with effective dates, credit value ₹0.10, 25% margin, GST-exclusive pack credits; meter: AsyncLocalStorage token metering of every AI call incl. scans and voice; wallet: per-pharmacy daily allowance (lazy IST refill, plan/trial/override) + balance, atomic charging, idempotent ledger credit_transactions; policy: full / free light mode / blocked, paid tools). Engines: pro=Precision (Gemini light/heavy tier, Groq fallback), swift=Swift (Groq gpt-oss-20b/120b, Gemini fallback); router labels task (question/lookup/report/action) -> tier. Static cacheable system prompt + per-turn <context>; report tools only for report/action; tool results compacted; older history shortened; expiries readable. Credits API /api/credits (+checkout via Cashfree payment_orders purpose CREDITS, settled in finalizeOrder). Scans and /tts gated (402 NO_CREDITS) and charged. Admin: /api/credits (config, wallets, grant/remove/daily override, summary) + AI Credits page. App: credits pill, engine switch, Credits sheet (packs, what-costs-what, history), composer cost hint, per-reply usage chip, out-of-credits card, payment return page for packs. Retest: chat on both engines, out-of-credits light mode, buy a pack in Cashfree sandbox, admin grant/remove/daily, scan + voice charges."
##   - agent: "main"
##     message: "Engine fallback. Each engine runs on its own provider first (Precision: Gemini 3.1 Flash-Lite for routing/questions/lookups, 3.5 Flash for records/reports/photos, 2.5 Flash backup; Swift: Groq gpt-oss-20b light, gpt-oss-120b records). If it can't answer (no key, rate limit, quota, error) the other engine answers, then NVIDIA Nemotron 3.5 Super (NVIDIA_API_KEY, shown as Swift) as the last resort; failed providers cool down (rate limit / bad key) so later steps skip them. Stream event `engine` + saved usage.switched_from/slow -> note on the reply ('Precision is busy right now, so Swift is answering', 'Due to high traffic, responses may be slow'); usage chip and charge use the engine that answered. All down -> 'Due to high demand, our agents will be back in a few moments. Please check back later.' Nemotron must call a tool first on record requests (it claimed drafts it never made). Latin-script messages never answered in Devanagari. /api/credits lists every enabled engine with `ready`; switch is top-left (compact on phones), unavailable engine greyed. Credits sheet: clearer tabs, engine cards. Retest: both engines; Groq key wrong -> Swift replies via Precision with note; Gemini+Groq wrong -> Nemotron with slow note; all wrong -> high-demand notice."
##   - agent: "main"
##     message: "AI mode + cost budget. Admin credit settings: ai_mode auto | gemini | groq | nemotron. Auto: routing on Gemini Flash-Lite; questions/lookups on Swift (Groq), records/reports/photos on Precision (Gemini Flash-Lite, 3.5 Flash backup); other engine covers, Nemotron last (slow note). Fixed mode: that provider only, failure -> 'Something went wrong. Please try again.'; nemotron mode shows the slow note on every reply. App: engine tab is an indicator (AUTO · Precision · Swift), lights the engine answering, unavailable greyed; no manual switch (PUT /api/credits/engine removed). Plan budgets: plan_budget_inr {BASIC 200, ADVANCED 350, AGENTIC 500} per plan year = our max AI cost for included usage; daily credits = budget left / days left at ₹0.08 per credit (cost of a credit), capped at budget_daily_cap_factor (2) × even share; wallet.included tracks cost of daily-credit spend + light mode per plan year; light mode only while budget left; grants/purchases/overrides separate. Admin page: mode picker, budgets with credits/day preview, Plan budget column. Groq: schemas sent without required + nullable fields, mid-stream errors surfaced; draft tools accept field aliases and refuse unnamed items. Internal <ui>/<context> notes never streamed. Measured (auto): question 0.4-0.7, lookup 0.8-1.1, draft 2.7-3.4, report 3.2, invoice photo 6.2 credits. Retest: each ai_mode, budget exhaustion -> blocked, engine tab during replies."
##   - agent: "main"
##     message: "Six features (Oct 24 2026). 1) Returns/Expiry: stock now leaves at note creation by units (partial returns), expiry list holds expired units off the shelf, purchase lines show return status, credit can be adjusted against supplier dues; existing notes keep working (legacy settle deducts their own units instead of zeroing the batch). 2) Voice typing on Groq Whisper (live turbo + final large-v3), no auto-send, charged once per dictation as 'Voice typing'; needs GROQ_API_KEY; browser recognizer fallback. 3) UPI QR (Settings, Billing, per-bill due, chat tool). 4) WhatsApp bill share with expiring token links served at /api/public/bill/:token; set SHARE_BASE_URL (or BACKEND_URL) to the public API origin. 5) Support queries: app /support + admin Support Queries; replies notify the pharmacy. 6) Keyboard layer; see the in-app panel (? key). New collections: support_tickets, bill_shares, stt_sessions, counters(support_ticket). Retest: partial return then delete, expiry list -> note -> adjust against dues -> supplier dues drop, purchase edit after a return, dictation on a real phone mic (Android Chrome, iOS Safari) in Hinglish, WhatsApp share on a phone, QR scan with GPay/PhonePe, admin reply -> app bell, shortcuts on Windows Chrome/Edge and Mac (Option keys), Firefox Alt+Shift."
##   - agent: "main"
##     message: "50-50 Launch Offer (admin panel, Oct 25 2026). New sidebar section lists the website registrations with follow-ups, one-click 50-day code + reviewed email, and their DavaDesk account once they sign up; Users has a 50-50 users filter and badge. Deploy needs on the admin backend (dev and prod): OFFER_LEADS_MONGO_URL (+ optional OFFER_LEADS_COLLECTION), Atlas network access for the server IP, OFFER_APP_URL_PROD / OFFER_APP_URL_DEV (defaults https://store.davadesk.in, https://store-dev.davadesk.in), optional MAIL_OFFER_SENDER_NAME, MAIL_REPLY_TO. Retest: dev send-test-to-me email, then a real lead registers on store-dev and applies the code -> ACTIVATED in admin."
##   - agent: "main"
##     message: "50-50 offer emails now go through Amazon SES (same account/sender as the app, admin-backend services/email.js sendTextEmail), Brevo only as fallback; the error shown in the panel now names the real cause. admin-backend needs @aws-sdk/client-ses (added to package.json) and AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION (optional AWS_SES_REGION) in its env on dev and prod. Verified: SES in production mode, davadesk.in verified, real test email delivered via SES."
##   - agent: "main"
##     message: "Refill reminder dose calculator + Short book (Oct 25 2026). New collection short_book. Retest: new bill with 2 medicines at different doses (½ and 1), custom date then Use recommended, bill saved -> reminder fires on the date; expand a bill -> Short book -> badge, same medicine from another bill merges, Short Book page order/received/remove, bill edit keeps the badge."
##   - agent: "main"
##     message: "Item QR labels + scan to bill, bill PDF UPI QR choice, return/expiry note PDF (Oct 25 2026). New frontend dependency jsqr. Retest on real hardware: print an A4 65-up sheet at 100% scale and a 50x25 thermal roll, scan labels with a USB/Bluetooth QR scanner in the product search and with a phone camera (Android Chrome, iPhone Safari), bill PDF with QR scanned by GPay/PhonePe."

  - agent: "main"
    message: "Mini QR labels, sizes per page: the labels dialog (Purchases > row QR icon, or per-item 'Print' in the 'QR label' column) now offers A4 Mini 26x15 mm (126/page), Small 38x21 mm (65), Medium 48x25 mm (44), Large 64x34 mm (24), plus 50x25 and 38x25 label-printer rolls. 'Skip used labels' works on every A4 sheet. Label text is fitted to the size (one name line on Mini, short 'MRP 22.40' when space is tight), no wrapping or overlap. Verified: every size renders, and each label's QR decodes with jsQR at 300 dpi. CI build passes. needs_retesting: true"

  - agent: "main"
    message: "Production readiness (2026-10-25). ROOT CAUSE of purchase 500 on prod: MongoDB ran standalone; purchases use transactions ('Transaction numbers are only allowed on a replica set member'). Prod Mongo is now a single-node replica set rs0 (keyfile auth); MONGO_URL and GLOBAL_MONGO_URI need directConnection=true. Local .env now reaches prod only via scripts/prod-db-tunnel.sh (localhost:27018). Code security: middleware/security.js (Mongo operator stripping on body/query/params, Redis-backed rate limits incl. per-user 120/min + per-pharmacy 6000/day on catalogue search), global medicines/doctors/distributors never listed without a search term and capped at 5 pages (doctors?limit=100000 used to dump the whole global table), reminders search regex escaped, logo upload limited to PNG/JPEG/WebP 2 MB, suppliers?highlight_id 500 fixed (const reassignment), list limits capped, JSON body 10 MB, /api-docs off in production, /health/ready (Mongo+Redis), graceful SIGTERM shutdown, JSON 404 for unknown API paths. Docker: Node 22 slim, npm ci --omit=dev, non-root, HEALTHCHECK. Frontend: source maps off in builds, single toast for HTTP 429. Infra (see deploy/README.md): nginx rate limits/TLS1.2+/HSTS/unknown-host drop, Redis password+AOF, UFW, fail2ban (sshd + nginx-limit-req), SSH hardening, nightly backups to disk + private S3 (restore drill passed), watchdog cron, certbot reload hook, OS patched + reboot recovery verified (~28 s). Security regression tests: scratchpad test-security.js 23/23. needs_retesting: true"

  - agent: "main"
    message: "Admin panel PROD + 50-50 fix (2026-10-26). PROD tab timed out because prod Mongo is now a replica set: admin-backend (and the dev API's GLOBAL_MONGO_URI) reach it through the Lightsail SSH tunnel on 27019 without directConnection, so the driver followed the member address localhost:27017 and failed. Code: admin-backend/db/connections.js and backend-node/utils/globalDb.js now connect directly to single-host mongodb:// URIs. Lightsail env: directConnection=true added; OFFER_LEADS_MONGO_URL/COLLECTION and SES keys added to the admin env (were missing, hence empty 50-50 page). Verified on server: admin PROD connected 176 ms, 65 offer registrations load, dev API global catalogue connected. needs_retesting: true"

  - agent: "main"
    message: "Welcome tour (2026-10-26). frontend/src/components/tour/ProductTour.jsx (TourProvider, useTour, spotlight overlay) + tourSteps.jsx (16 desktop steps, 9 phone steps). Starts by itself the first time a user with an ACTIVE/TRIAL plan reaches /dashboard (and no dialog is open); replay from profile menu 'Take the tour' or the phone More sheet. Next/Back/Skip, ← → Enter Esc, focus on the primary button, steps point at data-tour targets with fallbacks (tab under More → 'sits under More', tablet ☰ → 'Open the ☰ menu'). Saved per user: POST /api/users/me/tour {status completed|skipped, version, step}; /auth/me and /users/me return user.tour; localStorage backup. Dimming uses an SVG mask (box-shadow spread isn't reliably painted); app CSS blurs [role=dialog], so the role is on the card. Verified in browser on local stack: auto-start, all 16 desktop steps land on their targets (0 px), More fallback with hint, tablet ☰ fallback, phone 9 steps, light + dark, finish saved 'completed', Esc saved 'skipped' with step, reload doesn't re-show, profile menu replays. needs_retesting: true"

  - agent: "main"
    message: "Early access launch settings (2026-10-26). (1) Hide prices: pricing_config.display {hide_prices, label}, toggled in admin Pricing & Offers > Price visibility (PUT /api/pricing/display, superadmin, audited). While hidden, GET /api/plans sends no amounts (prices_hidden + launch_label), /billing/quote and /checkout return 403 PRICES_NOT_LAUNCHED, the upgrade page shows ₹XXX + 'Launching soon' on all three cards with the early access code box first; access codes still redeem. (2) Early access terms: /early-access/terms (12 sections + 4 highlights: bugs/report via Help & Support, 7-day inactivity rule, Partner badge, AI credits fair use). Shown after redeeming a code and required once per user (PROMO subscription) via ProtectedRoute; POST /api/users/me/early-access-terms {version:1} stores time/IP/UA; profile menu link. (3) AI credits chip at the top right (reuses CreditsPill/CreditsSheet), refreshes on page change, focus and 'credits-updated' (fired after scans and chat replies); tour step added. Scans (bill, invoice, pack) were already metered with the same settle() as the chatbot; label renamed. (4) npm run dev opens the prod DB SSH tunnel automatically (scripts/ensure-db-tunnel.js). Tests: scratchpad test-earlyaccess.js 20/20; browser: upgrade page hidden, code -> terms -> gate -> accept -> dashboard + tour, credits chip live refresh 0->25, admin toggle. needs_retesting: true"

  - agent: "main"
    message: "Prices masked by default + refill reminder rework (2026-10-26). pricing_config.display.hide_prices now defaults to true (app + admin); prod flag set to hidden. Credit packs: /api/credits omits prices and /credits/checkout returns 403 PRICES_NOT_LAUNCHED while hidden; the credits sheet shows 'Coming soon' and an early access note (current AI limits are for early access; full version gets extended AI usage). Refill reminder in billing: one row per medicine (dose chips -> lasts N days -> restock qty in packs), 'Remind me' chips (on the day / 1 / 2 / 3 days before / pick a date), plain summary; reminder items store product_id, inventory_id, units_per_pack, reorder_units. POST /api/reminders/:id/purchase-draft builds a purchase draft (source 'reminder') from the last purchase of each medicine: supplier, pack size, rate, MRP, GST, HSN, maker, quantity; batch/expiry left blank; idempotent. Tapping a refill notification (or 'Order stock') opens it on Purchases. Tests: scratchpad test-refill.js 14/14; browser: billing card, notification -> prefilled draft. needs_retesting: true"

  - agent: "main"
    message: "UI fixes + features (2026-10-26). (1) Billing suggestions: arrow-up no longer hides the top option under the sticky header (scroll-padding + scroll to top for the first option; duplicate scroll effects removed). (2) Refill reminder card: per-medicine Dose per day / Lasts / Restock blocks with boxed inputs; 'Pick a date' opens the native picker via showPicker(); summary wording fixed. (3) Udhar (Credit) in billing: paid-now amount, rest added to customer dues (bills is_credit, credit_amount, total_paid; 400 if paid now > total). (4) Stock levels unified in services/stockLevels.js: per medicine, unexpired stock vs custom threshold (products.custom_threshold, 0 = untracked) or global Settings threshold (own, else owner's); Low Stock = low, Shortage = low + out, Expiring uses expiry_warning_days, Expired = unsold expired stock; filters AND together; counts on pills; loader overlay + latest-request-wins; fixed Expired filter not refetching; PUT /api/inventory/threshold; Settings per-product editor uses it; dashboard + /alerts + /shortage use the same levels. (5) Customer tiers (services/customerTiers.js): Permanent / Running / Occasional / New / Inactive from visit days in a window, rules + per-tier discount per pharmacy (PUT /api/customers/tiers/config), pin tier / personal discount per customer (PUT /api/customers/:id/tier), filter chips + sort + profile card on Customers, billing shows tier and fills the discount. (6) Bill and purchase lists show the bill/purchase date and the created time separately with a Backdated tag. (7) Purchase suggestion box ~72% wide (860-1100 px), 440 px tall. (8) Item QR: compact DD2:<hex id> labels (version 2 QR vs 5), DD1 still accepted; scanner reads a full-resolution centre crop on alternate frames, every animation frame, 1080p + continuous autofocus. Tests: scratchpad test-batch.js 39/39, test-refill.js 14/14, browser checks. needs_retesting: true"

  - agent: "main"
    message: "Restock section + payment caps + udhar on bills (2026-10-26). (1) Restock page (/restock, nav 'Restock', alt+t): every refill reminder with customer, mobile, bill no, remind and run-out dates, per-medicine needed vs sellable stock, and status (Needs stock / Due / Ordered / Restocked / Done by hand). services/restock.js: auto DONE when unexpired stock covers every medicine's restock qty (reason names the purchase, or 'enough on hand'), checked whenever the list loads; sticky once done. GET /api/reminders/restock?view=open|due|done|all&search=, POST /api/reminders/:id/restock {action: done|reopen, force}; 'done' while short returns 409 STOCK_SHORT with what's short; the page confirms and force-marks it done by hand (overrides the stock check, logs who and what was short). Order stock makes/opens the purchase draft (status ORDERED). Refill notification click now opens Restock with the reminder highlighted. (2) Part payments capped at what's left: purchase Pay Part (dialog shows Total / Paid / Left to pay, inline error, Pay all, save disabled; POST /purchases/:id/payments returns 400 with remaining), Partial paid > total refused on purchase create/edit, bill Record Payment (inline error, dialog stays open, server message with remaining). (3) Number inputs: bill discount (and edit-bill discount) can be cleared, no default 0, capped at 100; Settings number fields, purchase units, reminder days, scan workspace qty/MRP no longer snap back. (4) Bill PDF for udhar: payment line 'UDHAR · PAID RS x', totals show Paid now, Udhar (this bill) and Total udhar (all bills) from the customer's dues. (5) Edit bill: Paid / Udhar switch with paid-now; PUT /api/bills/:id takes is_credit + paid_now, recalculates total_paid, payments, credit_amount and customer dues; paid now > total refused before any stock moves. Tests: scratchpad test-restock.js 34/34, test-batch.js still passing; browser: restock page, override dialog, notification -> restock highlight, Pay Part cap, discount clearing, edit bill Paid -> Udhar. needs_retesting: true"

  - agent: "main"
    message: "Billing product search + purchase supplier keyboard flow (2026-10-26). (1) Billing suggestion box (new bill and edit bill) now uses the Purchases size: ~72% of the screen (860-1100 px), 440 px tall; shared component components/billing/ProductSuggestions.jsx. (2) Filter chips on top: All / In stock / Near expiry (in-stock unexpired batches expiring within the Settings expiry warning days, nearest first), with counts; Alt+1/2/3 switch from the keyboard. Rows show an 'Expires <month>' tag when near expiry. (3) 'Details' button per medicine (or Alt+D on the highlighted one) opens a right-side panel: MRP, rate, maker, supplier, pack, GST, HSN, stock, every batch with expiry/stock/MRP, 'Add to the bill', and 'See alternates': GET /api/inventory/alternates?salt=&exclude= (services/alternates.js) finds in-stock, unexpired medicines in the pharmacy's inventory by salt: same salt & strength, same salt other strength, or sharing part of the salt; shows stock, price per unit vs the current one, near expiry; 'Use this' puts it into the bill row. (4) Manual entry is now the last option, pinned to the bottom edge of the box (keyboard order: medicines first, Manual last). (5) Purchases: saving (Cmd/Ctrl+Enter or the button) without a supplier now opens the supplier dropdown with the search focused and the first supplier highlighted; ↑/↓ + Enter picks it and focus returns to the field, so Cmd/Ctrl+Enter saves straight away; Cmd/Ctrl+Enter on the supplier field no longer reopens it. Tests: alternates API (exact/partial/related, order-independent salts, empty salt 400); browser: wide box, filters + counts, Alt+3, Alt+D details, See alternates, Use this fills the row, Manual entry at bottom, purchase save -> supplier picker -> Enter -> Cmd+Enter saves. needs_retesting: true"

  - agent: "main"
    message: "Dev API outage (2026-10-26), store-dev login showing 'CORS error'. Findings: api-dev.davadesk.in (Lightsail 13.233.245.179) accepts connections but never answers; the box has 412 MB RAM, 4-10 MB free, 440 MB in swap, load 16 on 2 vCPUs; docker CLI unresponsive; container healthchecks (a new node process every 30s, added by the production Dockerfile) piling up; later even SSH timed out. Dev config is the server's own .env + ~/deploy.sh (docker run), so the production merge did not change dev CORS. Code bug found and fixed: the Redis rate limiter (middleware/security.js, also from the production merge) shared the BullMQ connection (maxRetriesPerRequest: null), so if Redis is unreachable every /api request waits forever and the browser reports it as a CORS error. Now uses a lazy fail-fast connection (services/ai/queue.js fastConnection: no offline queue, 3s connect, 2s command timeout) and passOnStoreError lets requests through. Verified locally: Redis stopped -> /api/health 200 in 8 ms, login 200; old settings still waiting after 10s. Needs: reboot dev from the Lightsail console, more RAM (or fewer services) on dev, and deploying the fix. needs_retesting: true"

## Oct 28 2026: bill edit grand total, save shortcuts, bill PDF (needs_retesting: true)
- Billing (new + edit): a typed Grand Total now applies as you type (discount % with as many decimals as needed to hit the exact total), so Update Bill, ⌘/Ctrl+Enter and Alt+S/U all save it. Before, saving with the cursor still in Grand Total sent the old discount.
- Shortcut layer (components/shortcuts/Shortcuts.jsx): save keys (⌘/Ctrl+Enter, Alt+Enter, Alt+S, Alt+U, or `save: true`) pressed inside a field blur it first and save on the next tick, app-wide, including dialog Save buttons.
- Update Bill button shows ⌘↵ on Mac / Ctrl+Enter elsewhere (was a hardcoded "Alt+U"; Alt+U still works). Suggestion filter / details tooltips and the tour note are OS-aware.
- Bill PDF: "UDHAR (CREDIT)" -> "UNPAID" (or "PART PAID · RS x"); totals show Paid / Unpaid for this bill only (no "Total udhar (all bills)"); item DISC cells and Item/Bill discount rows highlighted in green.

## Oct 29 2026: admin offboarding, Global Data Manager, per-user AI credits (needs_retesting: true)
- agent: "main"
- Offboard & delete (admin All Users > user > Danger zone; SUPERADMIN, signed-in session only, not the x-admin-token): GET /api/users/:id/offboard/preview shows counts per collection; POST /offboard/otp emails a 6-digit code to the admin's own email (admin_action_otps: HMAC only, 5 min, single use, 5 attempts, 60 s between sends, 5 per hour, bound to admin + env + target user); POST /offboard {challenge_id, otp, confirm_name} rebuilds the plan on the server and deletes. Owner (or a pharmacy's only user): pharmacy + all its logins + every collection with pharmacy_id/pharmacyId/user_id/userId (found by scanning the DB), assistant messages, otp/auth rows and pending signups by email. Staff: only their login, sessions, settings, chats. Never global_*, admin/config collections, promo_codes, plans. R2 files queued in file_purge_requests; main API cron "purge-offboarded-files" (every 10 min) deletes them. Audited: OFFBOARD_CODE_SENT / _REJECTED, USER_OFFBOARDED with counts.
- Global Data Manager (admin sidebar "Global Data", /api/global-data): search/add/edit global_medicines, global_doctors, global_distributors in the shared global_collections DB (GLOBAL_MONGO_URI, else the prod server). New medicines get product_id/code/slug and the s_name/gram search keys the app's suggestions use. Review queue (global_review_queue, per env DB, one entry per kind + normalised key, sources per pharmacy): new products (products, purchases), suppliers (without global link) and doctors queue a BullMQ job on "global-review" (fire and forget, 5 s delay); the job runs in the scan worker process, fuzzy-matches against the catalogue and queues misses. Admin reviews with a search dropdown, then dismisses as duplicate or completes and adds (claimed, no double add; duplicate check with "add anyway").
- AI credits per user: POST /api/users/:id/credits {credits, reason, request_id} (SUPERADMIN) grants to the user's pharmacy wallet as ADMIN_GRANT with the user id; request_id makes double clicks grant once; audited CREDITS_GRANT via users. User detail shows the balance and "Add credits".
- Tested on a local Docker mongo 7 replica set + redis (no prod data): role/session/OTP binding, wrong code x5 lockout, expiry, replay, wrong name, staff vs owner scope, other pharmacy untouched (68 docs before/after), docs without ids kept, global collections untouched; matcher queued only new names (reordered doctor name, "DOLO 650MG TAB", "Azithral 500 Tab", "Samathu Agencies Pvt Ltd" matched), dedupe across pharmacies, create requests 20-50 ms; queue add/dismiss, admin-added medicine and distributor returned by the app's /medicines/search and /suppliers?include_global=true for another pharmacy; credit grant idempotent. Browser: Global Data page, review drawer dropdown, dismiss, add, Add credits, full offboard flow. Not tested: real R2 deletion, Brevo email delivery.

## Oct 29 2026: Broadcasts (notifications, offers, coming soon) from the admin panel (needs_retesting: true)
- agent: "main"
- Admin "Broadcasts" (sidebar MARKETING & OFFERS, /api/broadcasts): templates (blank, feature launch, coming soon, offer, service notice), composer with live banner + details preview (desktop/phone, light/dark). Types ANNOUNCEMENT / PROMOTION / COMING_SOON. Banner: headline, overview, emoji, picture, button text, ETA label; look: 8 gradient themes + custom colours, texture (glow, dots, grid, stripes, plain). Details elements: heading, paragraph (**bold**, *italic*, [link](path)), image, gallery, callout, feature cards, steps, big numbers, button, quote, YouTube video, countdown, tags, divider; cover picture; main button. Audience: everyone / pharmacies / specific users (search picker) + "pharmacy admins only", live reach count. Schedule: start, expiry (required except coming soon), display Banner / Spotlight (opens details once) / Notifications only, pin. Drafts: SUPERADMIN/ADMIN/OPERATOR; publish, edit live, archive, delete: SUPERADMIN/ADMIN; all audited (BROADCAST_*). Detail drawer: targeted / seen / opened / clicked / dismissed / cleared, recent viewers. Images uploaded to broadcast_assets (checked by bytes: PNG/JPEG/WebP/GIF, 2 MB, compressed in the browser), served publicly by both APIs.
- App: GET /api/broadcasts returns what is live for the user now (published, started, not expired, in audience), so users signed out at publish time see it on their next visit; expired ones disappear by themselves. POST /api/broadcasts/:id/event seen|open|click|dismiss|clear (live + targeted only; coming soon can't be cleared), POST /clear-all. Receipts in broadcast_receipts (one per broadcast + user). Banner carousel above page content (not on billing/purchases/assistant/scanner), hides once dismissed or opened; details in a modal; bell panel tabs "Updates" (clearable) and "Upcoming" (coming soon, permanent until archived); bell count includes unopened broadcasts. Spotlight waits for the welcome tour. Shared renderer components/broadcast/BroadcastRender.jsx is identical in frontend and admin-frontend (KEEP IN SYNC).
- Tested on a local Docker mongo 7 replica set + redis (no prod data): roles (support 403, publish only SUPERADMIN/ADMIN), audience (all / pharmacy / user / admins only), draft and scheduled hidden, expired hidden and can't be republished, user created after publish sees it, events + 404 for untargeted/draft, coming soon clear refused, clear persists, stats match, archive hides, delete only after archive (receipts removed), audience fields not sent to the app, validation (javascript: links, http images, non-YouTube video, unknown element, missing expiry/targets), SVG upload refused. Browser: composer with uploads and all elements, publish, banner carousel, modal (dark), main button navigates and counts a click, Updates/Upcoming tabs, clear, phone width, spotlight auto-open once.
