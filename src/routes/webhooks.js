const express = require('express');
const router = express.Router();
const transactionService = require('../services/transactionService');

/**
 * Transaction webhook endpoint
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
    res.status(statusCode).json({
      approved: result.approved
    });

    // Log for debugging (not sent to client)
    if (!result.approved) {
      console.log(`Decline reason: ${result.reason}`);
    }

  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({
      approved: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router;
