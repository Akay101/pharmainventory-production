# DavaDesk Admin Panel & Operations Console

This document outlines the architecture, setup, and features of the Admin Panel for the **DavaDesk** application. The admin app is separated into standalone backend and frontend applications located in the root repository and designed for independent deployment.

---

## 📁 Repository Structure

```text
pharmalogy-app/
├── backend-node/           # Main application backend (Node.js/Express, port 8001)
├── frontend/               # Main application frontend (React/CRA, port 3000)
│
├── admin-backend/          # Standalone Admin Backend (Node.js/Express, port 8002)
│   ├── db/
│   │   ├── connections.js  # Dual MongoDB Connection Manager (Dev & Prod)
│   │   └── tunnel.js       # Auto-tunneling for remote Lightsail cluster
│   ├── routes/
│   │   ├── env.js          # Environment health and latency check
│   │   ├── dashboard.js    # High-level KPIs, charts, and registration feeds
│   │   ├── pharmacies.js   # Pharmacy listings & users-per-pharmacy drilldown
│   │   ├── users.js        # User directory, roles, and subscription status
│   │   ├── leads.js        # Lead CRM, contact status, notes & call logs
│   │   ├── promos.js       # Promo code generator & redemption audit
│   │   └── analytics.js    # Visitor traffic, drop-offs & conversion funnel
│   ├── .env                # Dev and Prod Mongo URLs, PORT=8002
│   ├── server.js           # Server entry point
│   └── package.json
│
├── admin-frontend/         # Standalone Admin Frontend (React + Vite + Tailwind, port 3001)
│   ├── public/
│   │   └── assets/logoBrand/ # Authentic DavaDesk brand SVGs and logos
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.jsx             # Top bar with DEV / PROD switcher pill & DavaDesk brand
│   │   │   ├── Sidebar.jsx            # Desktop sidebar with DavaDesk logo & live badge counters
│   │   │   ├── MobileBottomNav.jsx    # Sticky mobile bottom navigation
│   │   │   ├── BottomDrawer.jsx       # Bottom-up sheet on phone / modal on desktop
│   │   │   ├── LeadNotesModal.jsx     # Lead contact, call notes & timeline
│   │   │   ├── PharmacyDetailDrawer.jsx # Users under pharmacy & invoice stats
│   │   │   ├── PromoGeneratorModal.jsx  # Code generator with plan presets
│   │   │   └── MetricCard.jsx         # Executive KPI cards
│   │   ├── pages/
│   │   │   ├── DashboardOverview.jsx  # Executive pulse, timeline & latest users
│   │   │   ├── LeadsCRM.jsx           # Sales CRM for unpaid registrations
│   │   │   ├── PharmaciesPage.jsx     # Onboarded pharmacies & user counts
│   │   │   ├── PromoCodesPage.jsx     # Active promo codes & usage tracking
│   │   │   ├── UsersPage.jsx          # User accounts directory & roles
│   │   │   └── AnalyticsFunnelPage.jsx # Conversion funnel & live audit stream
│   │   ├── api.js                     # Axios client with x-admin-env header
│   │   ├── App.jsx                    # Root router & environment state
│   │   └── index.css                  # Tailwind styles & safe-area padding
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
└── ADMIN_GUIDE.md
```

---

## ⚡ Core Features & Operations Capabilities

### 1. Dual Environment Switcher (DEV vs PROD)
- Toggle located prominently in the top header.
- **Dev MongoDB**: Configured via `DEV_MONGO_URL` in `.env`
- **Production MongoDB**: Configured via `PROD_MONGO_URL` and `PROD_TUNNEL_URL` in `.env`
- **Auto-Tunneling & Dual Mode Support**:
  - In production / Docker, it connects directly via `172.17.0.1:27017`.
  - In local development, the backend automatically tunnels via Lightsail (`api.davadesk.in:27017`) on local port `27019`, allowing instant connection to live production data from local machines!
- Both environments display live latency (e.g. `Dev: 518ms`, `Prod: 2266ms`) with live pulse indicators.

### 2. Registration Monitoring & Lead Management CRM
- Live visibility into every new user registering on the DavaDesk platform.
- **Automated Lead Detection**:
  - If user purchased a subscription $\rightarrow$ Status: **`SUBSCRIBED`** (emerald badge).
  - If user registered but has not purchased, or subscription expired, or dropped off during OTP $\rightarrow$ Status: **`FRESH LEAD`** (rose badge).
- **Contact & Follow-up CRM**:
  - One-click **"Mark as Connected"** toggle.
  - Multi-stage pipeline: `NEW`, `CONNECTED`, `FOLLOW_UP`, `WON`, `LOST`.
  - Customer Discussion Notes: Log team member name, call outcome (e.g., *Spoke on phone - Interested in Agentic plan*, *Demo scheduled*, *Pricing discussion*), and next follow-up date.
  - Full interaction history timeline stored per customer.
  - Quick action links: Direct Call (`tel:`), One-click WhatsApp message (`https://wa.me/`), and Email (`mailto:`).
  - Clean non-wrapping badges (`OTP Drop-off`, `New Unpaid`, `Expired Sub`) and stable table columns.

### 3. Pharmacy Store Directory & User Breakdown
- View all onboarded pharmacies and filter by active stores vs newly created.
- **Drilldown under every pharmacy**:
  - Exact count of users registered under that specific store.
  - User roster with names, emails, roles (Primary Admin vs Staff), and active plan names.
  - Total invoices created and inventory items uploaded for that pharmacy.
  - Drug license number, location, contact, and GST details.

### 4. Promo Code Generator & Manager
- Team members can generate promo codes directly from the admin panel:
  - Choose target subscription plan: **`BASIC`**, **`ADVANCED`**, or **`AGENTIC`**.
  - Choose duration presets: 7 Days Trial, 14 Days, 30 Days (1 Month), 90 Days, 365 Days (1 Year), or custom days.
  - Custom code or auto-generated 8-character uppercase alphanumeric code.
  - Usage limits (single pharmacy vs multi-use).
  - One-click copy to clipboard with toast notification.
  - Real-time redemption audit: See who redeemed the code, which pharmacy used it, and timestamp.
  - One-click activate/deactivate toggle and code deletion.

### 5. Visitor & Signup Funnel Analytics
- Complete visual conversion funnel:
  1. **Website Visitors**: Total unique traffic landing on the tool.
  2. **Signup Initiated**: Users who clicked register and started filling info.
  3. **Registration Completed**: Users who verified OTP and created account.
  4. **Active Subscriptions**: Paying or active promo customers.
- Conversion rate percentage and drop-off analysis.
- Live platform audit feed streaming latest invoices, inventory updates, and logins.

### 6. Mobile Responsiveness & Bottom-Up Modals
- **Bottom Navigation Bar on Phone**: Clean, fixed bottom navigation bar on mobile (<768px) with Overview, Pharmacies, Leads, Promos, and Funnel tabs, complete with iOS safe area insets.
- **Bottom-Up Modals (`BottomDrawer`)**: On phone screens, lead notes, pharmacy user rosters, and promo code generators slide up smoothly from the bottom with a drag handle for touch ergonomics. On desktop screens, they render as centered modal dialogs.
- **DavaDesk Branding**: Uses official SVG logos and assets from `frontend/public/assets/svgs/logoBrand`.

---

## 🚀 How to Run Locally

### Step 1: Start Admin Backend
```bash
cd admin-backend
npm install
npm start
# Runs on http://localhost:8002
```

### Step 2: Start Admin Frontend
```bash
cd admin-frontend
npm install
npm run dev
# Runs on http://localhost:3001
```

Access the Admin Console in your browser at:
👉 **`http://localhost:3001`**
