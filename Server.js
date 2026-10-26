require("dotenv").config();

const express = require("express");

const customerRoutes = require("./routes/customerRoutes");
const kycRoutes = require("./routes/kycRoutes");
const accountRoutes = require("./routes/accountRoutes");
const transactionRoutes = require("./routes/transactionRoutes");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).json({
    message: "Digital Banking API is running.",
  });
});

app.use("/api/customers", customerRoutes);
app.use("/api/kyc", kycRoutes);
app.use("/api/accounts", accountRoutes);
app.use("/api/transactions", transactionRoutes);

app.use((req, res) => {
  res.status(404).json({
    message: "Route not found.",
  });
});

app.use((error, req, res, next) => {
  console.error("Unexpected server error:", error.message);

  res.status(500).json({
    message: "An unexpected server error occurred.",
  });
});

app.listen(PORT, () => {
  console.log(`Banking API running on port ${PORT}`);
});