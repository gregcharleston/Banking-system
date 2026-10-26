require("dotenv").config();
const pool = require("./db");

async function setupDatabase() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(150) NOT NULL,
        email VARCHAR(150) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        verification_type VARCHAR(3)
          CHECK (verification_type IN ('BVN', 'NIN')),
        verification_status VARCHAR(20) NOT NULL DEFAULT 'pending'
          CHECK (verification_status IN ('pending', 'verified', 'failed')),
        verification_reference TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL UNIQUE
          REFERENCES customers(id),
        account_number VARCHAR(20) NOT NULL UNIQUE,
        balance NUMERIC(15, 2) NOT NULL DEFAULT 15000.00
          CHECK (balance >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        reference UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
        sender_account_id INTEGER REFERENCES accounts(id),
        recipient_account_id INTEGER REFERENCES accounts(id),
        transaction_type VARCHAR(20) NOT NULL
          CHECK (transaction_type IN ('funding', 'intra_bank', 'inter_bank')),
        amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
        status VARCHAR(20) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'successful', 'failed')),
        description TEXT,
        external_reference TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_sender
      ON transactions(sender_account_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_recipient
      ON transactions(recipient_account_id);
    `);

    await client.query("COMMIT");

    console.log("Database tables created or already exist.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Database setup failed:", error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

setupDatabase();