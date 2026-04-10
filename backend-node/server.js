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

app.use("/api/payments", require("./routes/payments"));
app.use("/api/webhook", require("./routes/webhook"));
app.use("/api/chat", require("./routes/chat"));

startCronJobs();

// Swagger Documentation setup
try {
  const swaggerUi = require('swagger-ui-express');
  const swaggerDocument = require('./swagger-output.json');
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
    customSiteTitle: "Pharmalogy API Explorer",
    customCss: '.swagger-ui .topbar { display: none }',
    explorer: true
  }));
} catch (error) {
  console.log("Swagger documentation not generated. Run 'npm run swagger' to generate.");
}

// Root API endpoint
app.get("/api/", (req, res) => {
  res.json({ message: "Pharmalogy API - Node.js/Express", version: "2.0.0" });
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
