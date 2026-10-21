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
