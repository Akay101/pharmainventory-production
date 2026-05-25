require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const startCronJobs = require("./services/cron");

// Import routes
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const supplierRoutes = require("./routes/suppliers");
const productRoutes = require("./routes/products");
const purchaseRoutes = require("./routes/purchases");
const inventoryRoutes = require("./routes/inventory");
const customerRoutes = require("./routes/customers");
const billRoutes = require("./routes/bills");
const dashboardRoutes = require("./routes/dashboard");
const medicineRoutes = require("./routes/medicines");
const migrateRoutes = require("./routes/migrate");
const pharmacyRoutes = require("./routes/pharmacy");
const activityRoutes = require("./routes/activities");
const settingsRoutes = require("./routes/settings");

const { createBullBoard } = require("@bull-board/api");
const { BullMQAdapter } = require("@bull-board/api/bullMQAdapter");
const { ExpressAdapter } = require("@bull-board/express");
const { scanQueue } = require("./services/ai/queue");
const basicAuth = require("express-basic-auth");

const app = express();
const PORT = process.env.PORT || 8001;
// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// MongoDB connection
mongoose
  .connect(process.env.MONGO_URL)
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

app.use("/api/webhook/cashfree", express.raw({ type: "application/json" }));

// API Routes - all prefixed with /api
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/products", productRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/bills", billRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/medicines", medicineRoutes);
app.use("/api/migrate", migrateRoutes);
app.use("/api/pharmacy", pharmacyRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/settings", settingsRoutes);

app.use("/api/payments", require("./routes/payments"));
app.use("/api/webhook", require("./routes/webhook"));
app.use("/api/chat", require("./routes/chat"));

// Bull Board Setup (Protected with Basic Auth)
if (!process.env.ADMIN_PASSWORD) {
  console.error(
    "CRITICAL ERROR: ADMIN_PASSWORD environment variable is missing."
  );
  process.exit(1);
}

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");
createBullBoard({
  queues: [new BullMQAdapter(scanQueue)],
  serverAdapter: serverAdapter,
});

app.use(
  "/admin/queues",
  basicAuth({
    users: { admin: process.env.ADMIN_PASSWORD },
    challenge: true,
  }),
  serverAdapter.getRouter()
);

startCronJobs();

// Swagger Documentation setup
try {
  const swaggerUi = require("swagger-ui-express");
  const swaggerDocument = require("./swagger-output.json");
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerDocument, {
      customSiteTitle: "Pharmacy API Explorer",
      customCss: ".swagger-ui .topbar { display: none }",
      explorer: true,
    })
  );
} catch (error) {
  console.log(
    "Swagger documentation not generated. Run 'npm run swagger' to generate."
  );
}

// Root API endpoint
app.get("/api/", (req, res) => {
  res.json({ message: "Pharmacy API - Node.js/Express", version: "2.0.0" });
});

// Health check endpoints
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    stack: "Node.js/Express",
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(err.status || 500).json({
    detail: err.message || "Internal server error",
  });
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Pharmalogy API running on port ${PORT}`);
});
