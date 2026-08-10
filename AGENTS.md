# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Development Commands

### Backend (Node.js/Express)
- **Development**: `cd backend-node && npm run dev` (uses nodemon for auto-restart)
- **Production**: `cd backend-node && npm run start`
- **Generate Swagger docs**: `cd backend-node && npm run swagger`
- **Start worker**: `cd backend-node && npm run worker`
- **Environment**: Uses `.env` file in backend-node root; Docker uses `.env.docker`

### Frontend (React/CRA)
- **Development**: `cd frontend && npm start` (uses craco)
- **Production Build**: `cd frontend && npm run build`
- **Test**: `cd frontend && npm test` (uses craco/test)
- **Environment**: Uses `.env` file in frontend root

### Docker
- **Start all services**: `docker-compose up -d`
- **Stop all services**: `docker-compose down`
- **Rebuild and restart**: `docker-compose up -d --build`
- **View logs**: `docker-compose logs -f [service]`

### Testing Protocol
This project uses a custom testing protocol documented in `test_result.md`. 
- Before implementing a feature, update the `test_plan` section with tasks.
- After implementation, update the backend/frontend sections with task status and set `needs_retesting: true`.
- Add a message to `agent_communication` describing changes.
- The testing agent (if available) will then handle testing and update the file.

## Architecture Overview

### Backend (`backend-node`)
- **Framework**: Node.js with Express
- **Database**: MongoDB via Mongoose
- **Key Components**:
  - `routes/`: REST API endpoints (inventory, medicines, purchases, billing, etc.)
  - `services/`: Business logic layer
  - `models/`: Mongoose schemas and models
  - `middleware/`: Custom middleware (auth, validation, rate limiting)
  - `workers/`: BullMQ workers for background jobs (e.g., scanning)
  - `utils/`: Utility functions (PDF generation, email, etc.)
  - `server.js`: Entry point
  - `swagger.js`: Swagger/OpenAPI documentation generation
- **Dependencies**: 
  - bullmq (job queue), ioredis (Redis connector), mongoose, bcryptjs (password hashing),
  - jsonwebtoken (authentication), cors, express-rate-limit, multer (file upload),
  - pdfkit (PDF generation), sharp (image processing), etc.

### Frontend (`frontend`)
- **Framework**: React with Create React App (via CRACO for configuration)
- **Styling**: Tailwind CSS
- **Key Components**:
  - `src/pages/`: Main pages (BillingPage.jsx, InventoryPage.jsx, PurchasesPage.jsx, etc.)
  - State management: React Context and hooks (useState, useEffect, useReducer)
  - Forms: React Hook Form with Zod validation
  - Data fetching: Axios
  - UI Components: Radix UI primitives, Sonner (toasts), Recharts (charts)
- **Dependencies**:
  - react-router-dom (v7), react-hook-form, zod, framer-motion, sonner,
  - embla-carousel-react, recharts, date-fns, lucide-icons, tailwindcss

### Infrastructure
- **Redis**: Used for BullMQ job queue and caching
- **Docker**: 
  - `frontend`: Served via nginx on port 3000
  - `backend`: Node.js server on port 8001
  - `worker`: BullMQ worker (same codebase as backend, different entrypoint)
  - `redis`: Redis alpine image
- **Environment Variables**:
  - Backend: PORT, MONGODB_URI, JWT_SECRET, REDIS_URL, etc.
  - Frontend: REACT_APP_API_URL (points to backend)

### Key Workflows
1. **Authentication**: JWT-based, routes protected by middleware
2. **File Uploads**: Handled via multer, stored locally or on AWS S3 (configurable)
3. **Background Jobs**: BullMQ queues for tasks like barcode scanning, PDF generation
4. **PDF Generation**: Dynamic PDFs for invoices, labels, reports using pdfkit
5. **Real-time Updates**: Not implemented via WebSocket; relies on polling or manual refresh

### Code Conventions
- **Backend**: 
  - Controllers in `routes/` handle request/response, delegate to `services/`
  - Services contain business logic and data access
  - Error handling via try/catch and express error middleware
- **Frontend**:
  - Functional components with hooks
  - Custom hooks for reusable logic (likely in `src/hooks/` if exists)
  - Components organized by feature in `src/` or `src/components/`
  - Styling with Tailwind utility classes

### Getting Started
1. Install dependencies: 
   ```bash
   cd backend-node && npm install
   cd frontend && npm install
   ```
2. Set up environment variables (copy `.env.example` if exists, or use `.env` files)
3. Ensure MongoDB and Redis are running (or use docker-compose)
4. Start development servers:
   ```bash
   # In one terminal
   cd backend-node && npm run dev
   # In another terminal
   cd frontend && npm start
   ```
5. Or use Docker: `docker-compose up -d`