const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");

function validAmount(amount) {
  const value = Number(amount);
  return (
    Number.isFinite(value) &&
    value > 0 &&
    Math.round(value * 100) === value * 100
  );
}

// GET TRANSACTION HISTORY
router.get("/history", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*
       FROM transactions t
       LEFT JOIN accounts sender ON sender.id = t.sender_account_id
       LEFT JOIN accounts recipient ON recipient.id = t.recipient_account_id
       WHERE sender.customer_id = $1
          OR recipient.customer_id = $1
       ORDER BY t.created_at DESC`,
      [req.user.customerId]
    );

    return res.status(200).json({
      count: result.rows.length,
      transactions: result.rows
    });
  } catch (error) {
    console.error("Transaction history error:", error.message);
    return res.status(500).json({
      message: "Could not retrieve transaction history"
    });
  }
});

// GET TRANSACTION STATUS
router.get("/status/:reference", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*
       FROM transactions t
       LEFT JOIN accounts sender ON sender.id = t.sender_account_id
       LEFT JOIN accounts recipient ON recipient.id = t.recipient_account_id
       WHERE t.reference::text = $1
         AND (
           sender.customer_id = $2
           OR recipient.customer_id = $2
         )`,
      [req.params.reference, req.user.customerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Transaction not found"
      });
    }

    return res.status(200).json({
      transaction: result.rows[0]
    });
  } catch (error) {
    console.error("Transaction status error:", error.message);
    return res.status(500).json({
      message: "Could not retrieve transaction status"
    });
  }
});

// LOCAL / INTRA-BANK TRANSFER
router.post("/transfer", auth, async (req, res) => {
  const { recipient_account, amount, description } = req.body;

  if (!recipient_account || !validAmount(amount)) {
    return res.status(400).json({
      message: "Provide a recipient account number and a valid amount"
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const senderResult = await client.query(
      `SELECT id, account_number, balance
       FROM accounts
       WHERE customer_id = $1
       FOR UPDATE`,
      [req.user.customerId]
    );

    if (senderResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        message: "Sender account not found"
      });
    }

    const sender = senderResult.rows[0];

    const recipientResult = await client.query(
      `SELECT id, account_number, balance, customer_id
       FROM accounts
       WHERE account_number = $1
       FOR UPDATE`,
      [String(recipient_account)]
    );

    if (recipientResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        message: "Recipient account not found"
      });
    }

    const recipient = recipientResult.rows[0];

    if (sender.id === recipient.id) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "You cannot transfer to your own account"
      });
    }

    if (Number(sender.balance) < Number(amount)) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Insufficient balance"
      });
    }

    await client.query(
      `UPDATE accounts
       SET balance = balance - $1
       WHERE id = $2`,
      [amount, sender.id]
    );

    await client.query(
      `UPDATE accounts
       SET balance = balance + $1
       WHERE id = $2`,
      [amount, recipient.id]
    );

    const transactionResult = await client.query(
      `INSERT INTO transactions
       (sender_account_id, recipient_account_id,
        transaction_type, amount, status, description)
       VALUES ($1, $2, 'intra_bank', $3, 'successful', $4)
       RETURNING *`,
      [
        sender.id,
        recipient.id,
        amount,
        description || "Local bank transfer"
      ]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      message: "Transfer successful",
      transaction: transactionResult.rows[0]
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Local transfer error:", error.message);

    return res.status(500).json({
      message: "Transfer failed"
    });
  } finally {
    client.release();
  }
});

// INTER-BANK TRANSFER — TEST MODE ONLY
router.post("/inter-bank-transfer", auth, async (req, res) => {
  const { recipient_account, amount, test_mode } = req.body;

  if (!recipient_account || !/^\d{10}$/.test(String(recipient_account))) {
    return res.status(400).json({
      message: "Recipient account must contain exactly 10 digits"
    });
  }

  if (!validAmount(amount)) {
    return res.status(400).json({
      message: "Enter a valid amount greater than zero"
    });
  }

  if (test_mode === true) {
    return res.status(200).json({
      message: "Inter-bank transfer route is working",
      test_mode: true,
      transfer_sent: false,
      amount: Number(amount),
      recipient_account: String(recipient_account)
    });
  }

  return res.status(501).json({
    message: "Real inter-bank transfers are not yet implemented",
    transfer_sent: false
  });
});

module.exports = router;