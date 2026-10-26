const express = require("express");
const pool = require("../db");
const auth = require("../middleware/auth");
const { nibssRequest } = require("../services/nibssService");

const router = express.Router();

function providerRejected(data) {
  if (!data || typeof data !== "object") {
    return true;
  }

  if (data.success === false || data.valid === false) {
    return true;
  }

  if (data.status === false) {
    return true;
  }

  const message = String(data.message || "").toLowerCase();

  return (
    message.includes("invalid") ||
    message.includes("not found") ||
    message.includes("mismatch") ||
    message.includes("failed")
  );
}

async function verifyIdentity(req, res, type) {
  const field = type === "BVN" ? "bvn" : "nin";
  const value = req.body[field];

  if (typeof value !== "string" || !/^\d{11}$/.test(value)) {
    return res.status(400).json({
      message: `${type} must be provided as an 11-digit string.`,
    });
  }

  try {
    const customerResult = await pool.query(
      `SELECT id, verification_status
       FROM customers
       WHERE id = $1`,
      [req.user.customerId]
    );

    if (customerResult.rows.length === 0) {
      return res.status(404).json({
        message: "Customer not found.",
      });
    }

    const endpoint =
      type === "BVN" ? "/api/validateBvn" : "/api/validateNin";

    const providerData = await nibssRequest("post", endpoint, {
      [field]: value,
    });

    if (providerRejected(providerData)) {
      await pool.query(
        `UPDATE customers
         SET verification_type = $1,
             verification_status = 'failed'
         WHERE id = $2`,
        [type, req.user.customerId]
      );

      return res.status(400).json({
        message: `${type} verification was not accepted by the provider.`,
        provider_response: providerData,
      });
    }

    await pool.query(
      `UPDATE customers
       SET verification_type = $1,
           verification_status = 'verified'
       WHERE id = $2`,
      [type, req.user.customerId]
    );

    return res.status(200).json({
      message: `${type} verification request completed.`,
      verification_type: type,
      verification_status: "verified",
      provider_response: providerData,
    });
  } catch (error) {
    console.error(`${type} verification failed:`, error.response?.status || error.message);

    return res.status(502).json({
      message: `${type} verification could not be completed with the provider.`,
      provider_status: error.response?.status || null,
    });
  }
}

router.post("/verify-bvn", auth, async (req, res) => {
  return verifyIdentity(req, res, "BVN");
});

router.post("/verify-nin", auth, async (req, res) => {
  return verifyIdentity(req, res, "NIN");
});

module.exports = router;