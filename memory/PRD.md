# Pharmalogy - Pharmacy Inventory Management System

## Overview
Pharmalogy is a comprehensive inventory management system specialized for pharmacies in India, built with **MERN Stack (MongoDB, Express.js, React, Node.js)**. Features enhanced unit-based inventory tracking with pack+units display for accurate profit calculation.

## Original Problem Statement
Build a full-proof Inventory Management System for pharmacies with:
- JWT-based authentication with OTP email verification (Brevo)
- Multi-step registration flow for pharmacy owners
- User management (Admin/Pharmacist roles)
- **Enhanced unit-based purchase and inventory tracking** (tablets, ml, units)
- Inventory management with **pack+units display** (e.g., "2 Strips + 5 units")
- Billing with PDF generation and email to customers
- Dashboard with analytics and AI tips
- Cloudflare R2 for file storage
- All amounts in Indian Rupees (₹)

## Tech Stack Migration (Feb 3, 2026) ✅ COMPLETED

### Before (Python/FastAPI)
- Backend: FastAPI with Motor (async MongoDB driver)
- ~2900 lines in single server.py file

### After (Node.js/Express) - CURRENT
- Backend: Express.js with Mongoose
- Modular structure: routes/, middleware/, services/
- JWT authentication via jsonwebtoken
- PDF generation via pdfkit
- All API endpoints preserved with same paths

## Enhanced Unit-Based Tracking System (Updated Feb 2026)

### Purchase Entry Fields
- **Product Name** - Searchable from medicine database
- **Manufacturer (MFG.)** - Auto-filled from medicine database
- **Salt Composition** - Auto-filled from medicine database
- **Pack Type** - Strip, Bottle, Tube, Packet, Box, Unit
- **Quantity** - Number of packs purchased
- **Units** - Units per pack (tablets/ml/units)
- **Rate (Pack)** - Purchase price per pack
- **Rate/Unit** - Auto-calculated (Rate/Units)
- **MRP/Unit** - Selling price per unit
- **MRP (Pack)** - Auto-calculated (MRP/Unit × Units)
- **Final Amount** - Auto-calculated (Quantity × Rate Pack)

### Inventory Display
Shows "X Packs + Y units (total units)" format:
- Example: "2 Strips + 5 units (25 total units)"
- Shows total units below for quick reference
- Pack type preserved from purchase entry

### Billing
- Sell individual **UNITS** (tablets, ml)
- Deducts **UNITS** from inventory
- Profit = `(sell_price - cost_per_unit) × quantity_sold`
- Inventory updates show remaining packs + loose units

### Example Flow
```
Purchase: 2 strips × 10 tablets/strip = 20 tablets at ₹1/tablet cost
Bill: Sell 5 tablets at ₹2/tablet = ₹10 revenue, ₹5 profit
Inventory: 1 Strip + 5 units (15 total units) remaining
```

## Core Requirements - All Implemented ✅

### Authentication & User Management
- [x] JWT-based authentication
- [x] OTP email verification via Brevo
- [x] Multi-step registration (Personal Info → Pharmacy Details → OTP)
- [x] Admin and Pharmacist roles
- [x] User creation with OTP verification to primary admin

### Inventory Management
- [x] Products catalog with configurable low-stock thresholds
- [x] Inventory items with batch numbers and expiry dates
- [x] Low stock and expiry alerts
- [x] Search and filter functionality
- [x] **Unit-Based Tracking** - Shows available UNITS, cost/unit, MRP/unit
- [x] **Pack+Units Display** - Shows "X Strips + Y units (total units)" format (NEW - Feb 2, 2026)
- [x] **Enhanced Columns** - Product, MFG., Batch, Pack Type, Expiry, Available Stock, Cost/Unit, MRP/Unit, Stock Value, Status (NEW - Feb 2, 2026)
- [x] **Stock Value** - Calculated as units × cost per unit
- [x] **Pagination & Sorting** - Server-side pagination with sortable columns

### Purchase Management
- [x] Record purchases from suppliers
- [x] Auto-populate inventory from purchases
- [x] Multiple items per purchase
- [x] Invoice tracking
- [x] **Inline Editable Table** - Add/edit items inline without modal
- [x] **Enhanced Entry Fields** - Product, MFG, Salt, Pack Type, Qty, Units, Rate(Pack), Rate/Unit, MRP/Unit, MRP(Pack), Amount (NEW - Feb 2, 2026)
- [x] **Auto-Calculated Fields** - Total Units, Rate/Unit, MRP(Pack), Final Amount (NEW - Feb 2, 2026)
- [x] **Tab Key Defaults** - Press Tab on empty field to fill default (Qty=1, Units=1) (NEW - Feb 2, 2026)
- [x] **LocalStorage Auto-Save** - Draft saved automatically, restore dialog on return (NEW - Feb 2, 2026)
- [x] **Edit Purchases** - PUT endpoint to update existing purchases
- [x] **CSV Import** - Bulk import purchases via CSV file
- [x] **Smart Scanner** - AI-powered image scanning (Gemini 3 Flash)
- [x] **Medicine Search Suggestions** - Fixed z-index, visible above table

### Billing System
- [x] Customer search and management
- [x] Product search with batch selection
- [x] **Sells UNITS** - Inventory shows "X units available"
- [x] Item-level and bill-level discounts
- [x] **Profit/loss visibility** - Based on per-unit cost
- [x] Debt tracking with due dates
- [x] PDF generation with Cloudflare R2 storage (Uses Rs. instead of ₹)
- [x] Email bill to customer via Brevo
- [x] **Negative Billing** - Manual entry for items not in inventory
- [x] **Delete Bills** - With option to restore inventory
- [x] **Edit Bills** - PUT /api/bills/{id} for customer info, discount, notes
- [x] **Inline Editable Table** - Billing page with server-side inventory search
- [x] **Keyboard Shortcuts** - Alt+N (new), Alt+A (add item), Alt+S (save), Enter/Esc
- [x] **Tab Key Defaults** - Press Tab on empty field for defaults (Walk-in, 0000000000) (NEW - Feb 2, 2026)
- [x] **LocalStorage Auto-Save** - Draft saved automatically, restore dialog on return (NEW - Feb 2, 2026)

### Customer Management
- [x] Customer search and list
- [x] Customer details with purchase history
- [x] Debt tracking
- [x] **Clear Debt** - Mark debt as paid, auto-marks bills as paid (NEW - Jan 30, 2026)

### UI/UX Features
- [x] **Light/Dark Mode Toggle** - With purple light theme
- [x] **Theme Persistence** - Saves preference to localStorage
- [x] **Search Dropdown Fixed** - z-index fixed, appears above tables
- [x] **Inline Editable Tables** - For purchases and billing data entry
- [x] **Unit-Based Display** - Shows "X units" everywhere
- [x] **Keyboard Shortcuts** - Alt+N, Alt+A, Alt+S, Enter, Esc for faster data entry
- [x] **User Profile Update** - Edit name/phone with OTP verification
- [x] **Collapsible Sidebar** - Save space with icon-only view, tooltips on hover (NEW - Feb 2, 2026)
- [x] **Smart Search** - Search by name or salt composition, ranked results (exact > starts with > contains) (NEW - Feb 2, 2026)

### Dashboard & Analytics
- [x] Today's and monthly revenue/profit stats
- [x] Sales trend charts (30 days)
- [x] Top selling products
- [x] Supplier purchase analysis
- [x] Low stock and expiry alerts
- [x] AI business tips (OpenAI GPT-5.2)
- [x] Debt summary and top debtors

### Data Management
- [x] **JSON Data Migration** - Import suppliers, customers, products, inventory, purchases, bills
- [x] **Template Download** - JSON templates for each data type
- [x] **Medicine Database** - 253,973 Indian medicines imported

### File Storage
- [x] Cloudflare R2 integration
- [x] Pharmacy logo upload
- [x] User avatar upload
- [x] Bill PDF storage

## Known Issues

### Brevo Email Authentication (BLOCKED on User Action)
- **Issue**: OTP emails fail with 401 Unauthorized from Brevo API
- **Workaround**: OTP displayed on registration screen
- **Fix Required**: User must whitelist server IP `34.16.56.64` in Brevo account (Settings → Security → Authorized IPs)

## Upcoming Tasks

### P1 - Priority 1
- [ ] **RBAC for Pharmacists** - Restrict API access for PHARMACIST role
- [ ] **Admin OTP on New User** - Notify main admin when new user is added
- [ ] **Partial Debt Payments** - Allow customers to pay a portion of outstanding debt
- [ ] **Delete Old Python Backend** - Remove /app/backend/ once Node.js is stable

### P2 - Priority 2
- [ ] **AI Business Tips** - Integrate LLM for dashboard insights
- [ ] **Barcode/QR Scanning** - For faster billing and purchasing
- [ ] **Frontend Image Uploads** - UI for uploading pharmacy logo and user profile pictures

## Technical Architecture

### Backend (Node.js/Express) - MIGRATED Feb 3, 2026
- Express.js with Mongoose (MongoDB driver)
- JWT authentication via jsonwebtoken
- bcryptjs for password hashing
- pdfkit for PDF generation
- Modular structure: routes/, middleware/, services/
- emergentintegrations for AI features

### Frontend
- React with React Router
- TailwindCSS + Shadcn/UI components
- Axios for API calls
- Sonner for toast notifications

### Database
- MongoDB with collections: users, pharmacies, products, inventory, purchases, bills, customers, suppliers

### External Services
- **Brevo** - Email (OTP, bill PDFs)
- **Cloudflare R2** - File storage
- **Gemini 3 Flash** - AI image scanning

## Test Credentials
- **Email**: test@pharmalogy.com
- **Password**: test123456
- **Role**: ADMIN

## API Endpoints

### Key Endpoints
- `POST /api/auth/register` - Multi-step registration
- `POST /api/purchases` - Create purchase (unit-based)
- `PUT /api/purchases/{id}` - Update purchase
- `DELETE /api/purchases/{id}` - Delete purchase
- `POST /api/bills` - Create bill (deducts units from inventory)
- `PUT /api/bills/{id}` - Edit bill (customer info, discount, notes) **NEW**
- `DELETE /api/bills/{id}` - Delete bill (optionally restore inventory)
- `POST /api/bills/{id}/mark-paid` - Mark bill as paid
- `POST /api/customers/{id}/clear-debt` - Clear customer debt
- `GET /api/inventory` - List inventory (shows units)
- `GET /api/inventory/search?q={term}` - Server-side inventory search **NEW**
- `GET /api/inventory/alerts` - Dashboard alerts
- `POST /api/purchases/scan-image` - AI image scanning
- `POST /api/users/request-profile-update` - Request OTP for profile update **NEW**
- `POST /api/users/verify-profile-update` - Verify OTP and update profile **NEW**
- `GET /health` - Health check for deployment

## File Structure
```
/app/
├── backend/              # OLD Python backend (deprecated)
│   └── server.py
├── backend-node/         # NEW Node.js/Express backend
│   ├── server.js         # Main Express app entry point
│   ├── middleware/
│   │   └── auth.js       # JWT authentication middleware
│   ├── routes/
│   │   ├── auth.js       # Authentication routes
│   │   ├── bills.js      # Bills CRUD
│   │   ├── customers.js  # Customers CRUD
│   │   ├── dashboard.js  # Dashboard stats & charts
│   │   ├── inventory.js  # Inventory list, search, alerts
│   │   ├── medicines.js  # Medicine database search
│   │   ├── migrate.js    # JSON data migration
│   │   ├── pharmacy.js   # Pharmacy settings
│   │   ├── products.js   # Products catalog
│   │   ├── purchases.js  # Purchases CRUD & scan
│   │   ├── suppliers.js  # Suppliers CRUD
│   │   └── users.js      # User management
│   ├── services/
│   │   ├── email.js      # Brevo email service
│   │   ├── pdf.js        # PDF generation
│   │   └── r2.js         # Cloudflare R2 storage
│   ├── package.json
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/        # Shadcn components
│   │   │   ├── DashboardLayout.jsx (theme toggle, collapsible sidebar)
│   │   │   └── EditableTable.jsx
│   │   ├── pages/
│   │   │   ├── PurchasesPage.jsx (unit-based, inline table, fixed suggestions)
│   │   │   ├── InventoryPage.jsx (shows units)
│   │   │   ├── BillingPage.jsx (sells units, delete bills)
│   │   │   ├── CustomersPage.jsx (clear debt button)
│   │   │   └── ScannerPage.jsx
│   │   ├── index.css      # Theme variables (light/dark)
│   │   └── App.js
│   ├── package.json
│   └── .env
└── memory/
    └── PRD.md
```

## Recent Changes (Feb 3, 2026)

### MAJOR: Backend Migration to Node.js/Express (MERN Stack)
- **Completed full migration** from Python/FastAPI to Node.js/Express
- All API endpoints preserved with identical paths
- Database schema unchanged (MongoDB)
- JWT authentication migrated to jsonwebtoken library
- PDF generation migrated to pdfkit
- Email service migrated to sib-api-v3-sdk (Brevo Node.js SDK)
- R2 storage migrated to @aws-sdk/client-s3
- **100% test pass rate** - All 23 backend tests passed
- **Frontend compatibility** - All pages working correctly

1. **MRP Reversal** - User now enters MRP(Pack), MRP/Unit is auto-calculated (instead of vice versa)
2. **Collapsible Sidebar** - Click "Collapse" to shrink to icon-only view, expands with tooltips on hover
3. **Search by Salt** - Inventory and billing search includes salt composition (name OR salt)
4. **Improved Search Ranking** - Results sorted: exact match first, then starts with, then contains
5. **Salt Auto-fill** - When selecting medicine with composition data, salt field auto-fills

## Changes (Feb 2, 2026 - Part 1)

1. **Enhanced Purchase Entry Fields** - Added Manufacturer, Salt Composition (auto-filled from medicine DB), Pack Type (Strip/Bottle/Tube/Packet/Box/Unit)
2. **Renamed Fields** - Qty (was Packs), Units (was Units/Pack), Rate(Pack), Rate/Unit, MRP/Unit, MRP(Pack), Final Amount
3. **Auto-Calculated Fields** - Total Units, Rate/Unit, MRP(Pack), Final Amount calculated automatically
4. **Tab Key Defaults** - Press Tab on empty field to fill default value (Qty=1, Units=1, Customer='Walk-in')
5. **LocalStorage Auto-Save** - Purchases and Billing forms auto-saved to localStorage, with restore dialog
6. **Inventory Pack+Units Display** - Shows "X Strips + Y units (total units)" format
7. **Medicine Search Auto-Fill** - Manufacturer and Salt Composition auto-filled from medicine database

## Changes (Jan 31, 2026)

1. **Billing Page Rewrite** - Complete inline editable table with server-side inventory search
2. **Keyboard Shortcuts** - Alt+N, Alt+A, Alt+S, Enter, Esc for purchases and billing
3. **Edit Bills** - PUT /api/bills/{id} endpoint and UI dialog
4. **User Profile Update** - Edit name/phone with OTP verification in Settings > Profile tab
5. **Purchase Edit Modal Scroll** - Fixed scrolling within edit dialog

## Changes (Jan 30, 2026)

1. **Unit-Based Inventory System** - Complete implementation
2. **Light/Dark Mode Toggle** - Purple theme for light mode
3. **Purchase Suggestions z-index Fixed** - Dropdown appears above table
4. **Delete Bills** - With option to restore inventory
5. **Clear Customer Debt** - Button in customers page and detail dialog
6. **Edit Purchases** - PUT endpoint with inventory sync
