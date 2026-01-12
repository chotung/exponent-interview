const express = require('express');
const router = express.Router();
const transactionService = require('../services/transactionService');
const settlementService = require('../services/settlementService');

/**
 * Transaction authorization webhook endpoint
 *
 * Receives transaction authorization requests
 * POST /webhooks/transactions
 *
 * Request body:
 * {
 *   "id": "transaction_123",
 *   "card_id": "card_123",
 *   "amount": 100,  // cents
 *   "currency": "usd",
 *   "merchant_data": {
 *     "category": 7623,
 *     "address": { ... }
 *   }
 * }
 *
 * Response:
 * { "approved": true } or { "approved": false }
 */
router.post('/transactions', async (req, res) => {
  try {
    const webhookData = req.body;

    // Validate required fields
    if (!webhookData.id || !webhookData.card_id || !webhookData.amount) {
      return res.status(400).json({
        approved: false,
        error: 'Missing required fields: id, card_id, amount'
      });
    }

    // Authorize transaction (now async)
    const result = await transactionService.authorizeTransaction(webhookData);

    // Return simple approved/declined response as per spec
    const statusCode = result.approved ? 200 : 200; // Always 200, just change approved flag
    const response = {
      approved: result.approved
    };

    // Include transaction details if approved
    if (result.approved && result.transaction) {
      response.transaction = result.transaction;
    }

    // Include reason if declined
    if (!result.approved && result.reason) {
      response.reason = result.reason;
    }

    res.status(statusCode).json(response);

  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({
      approved: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Transaction settlement webhook endpoint
 *
 * Receives settlement requests to finalize transactions
 * POST /webhooks/settlements
 *
 * Request body:
 * {
 *   "transaction_id": "transaction_123",
 *   "final_amount": 85.00  // Optional: if different from authorized amount
 * }
 *
 * Response:
 * { "settled": true } or { "settled": false, "reason": "..." }
 */
router.post('/settlements', async (req, res) => {
  try {
    const settlementData = req.body;

    // Validate required fields
    if (!settlementData.transaction_id) {
      return res.status(400).json({
        settled: false,
        error: 'Missing required field: transaction_id'
      });
    }

    // Settle transaction
    const result = await settlementService.settleTransaction(settlementData);

    const response = {
      settled: result.settled
    };

    // Include transaction if settled successfully
    if (result.settled && result.transaction) {
      response.transaction = result.transaction;
    }

    // Include reason if not settled
    if (!result.settled && result.reason) {
      response.reason = result.reason;
    }

    res.status(200).json(response);

  } catch (error) {
    console.error('Error processing settlement:', error);
    res.status(500).json({
      settled: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router;
