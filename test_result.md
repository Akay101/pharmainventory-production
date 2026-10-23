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
