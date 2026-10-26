const express = require("express");
const crypto = require("crypto");
const pool = require("../db");
const auth = require("../middleware/auth");
const { nibssRequest } = require("../services/nibssService");

const router = express.Router();

function generateAccountNumber() {
  return String(crypto.randomInt(1000000000, 2000000000));
}

// OPEN ACCOUNT
router.post("/open", auth, async (req, res) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    const customerResult = await client.query(
      `SELECT id, verification_status
       FROM customers
       WHERE id = $1
       FOR UPDATE`,
      [req.user.customerId]
    );

    const customer = customerResult.rows[0];

    if (!customer) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(404).json({
        message: "Customer not found.",
      });
    }

    if (customer.verification_status !== "verified") {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(403).json({
        message: "Complete BVN or NIN verification before opening an account.",
      });
    }

    const existingAccount = await client.query(
      "SELECT id, account_number, balance FROM accounts WHERE customer_id = $1",
      [req.user.customerId]
    );

    if (existingAccount.rows.length > 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(409).json({
        message: "You already have a bank account.",
        account: existingAccount.rows[0],
      });
    }

    let account;
    let attempts = 0;

    while (!account && attempts < 5) {
      attempts++;

      try {
        const accountResult = await client.query(
          `INSERT INTO accounts (customer_id, account_number, balance)
           VALUES ($1, $2, 15000.00)
           RETURNING id, account_number, balance, created_at`,
          [req.user.customerId, generateAccountNumber()]
        );

        account = accountResult.rows[0];
      } catch (error) {
        if (error.code === "23505" && attempts < 5) {
          continue;
        }

        throw error;
      }
    }

    if (!account) {
      throw new Error("Unable to generate a unique account number.");
    }

    await client.query(
      `INSERT INTO transactions
         (recipient_account_id, transaction_type, amount, status, description)
       VALUES ($1, 'funding', 15000.00, 'successful', $2)`,
      [account.id, "Initial account funding"]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return res.status(201).json({
      message: "Bank account opened successfully.",
      account: {
        account_number: account.account_number,
        balance: account.balance,
        currency: "NGN",
        created_at: account.created_at,
      },
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Account-opening rollback failed:", rollbackError.message);
      }
    }

    console.error("Account opening failed:", error.message);

    if (error.code === "23505") {
      return res.status(409).json({
        message: "An account already exists for this customer.",
      });
    }

    return res.status(500).json({
      message: "Unable to open bank account.",
    });
  } finally {
    client.release();
  }
});

// CHECK BALANCE
router.get("/balance", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT account_number, balance, created_at
       FROM accounts
       WHERE customer_id = $1`,
      [req.user.customerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Bank account not found.",
      });
    }

    return res.status(200).json({
      message: "Balance retrieved successfully.",
      account: {
        account_number: result.rows[0].account_number,
        balance: result.rows[0].balance,
        currency: "NGN",
      },
    });
  } catch (error) {
    console.error("Balance enquiry failed:", error.message);

    return res.status(500).json({
      message: "Unable to retrieve balance.",
    });
  }
});

// ACCOUNT NAME ENQUIRY
router.get("/name-enquiry/:accountNumber", auth, async (req, res) => {
  const accountNumber = req.params.accountNumber;

  if (!/^\d{10}$/.test(accountNumber)) {
    return res.status(400).json({
      message: "Provide a valid 10-digit account number.",
    });
  }

  try {
    const data = await nibssRequest(
      "get",
      `/api/account/name-enquiry/${accountNumber}`
    );

    return res.status(200).json({
      message: "Account name enquiry completed.",
      result: data,
    });
  } catch (error) {
    console.error(
      "Account name enquiry failed:",
      error.response?.status || error.message
    );

    return res.status(502).json({
      message: "Account name enquiry failed at the provider.",
      provider_status: error.response?.status || null,
    });
  }
});

module.exports = router;