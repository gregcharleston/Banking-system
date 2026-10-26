require("dotenv").config();

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true },
});

pool.on("error", (err) => {
  console.error("Unexpected database pool error:", err.message);
});

module.exports = pool;