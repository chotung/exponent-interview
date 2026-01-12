const express = require('express');
const router = express.Router();
const transactionService = require('../services/transactionService');
const accountRepository = require('../repositories/accountRepository');

/**
 * Process a payment
 *
 * POST /payments
 *
 * Request body:
 * {
 *   "account_id": "account_123",
 *   "amount": 100.00  // Amount to pay in dollars
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "transaction_id": "payment_abc123",
 *   "new_balance": 50.00,
 *   "amount_paid": 100.00
 * }
 */
router.post('/', async (req, res) => {
  try {
    const { account_id, amount } = req.body;

    // Validate required fields
    if (!account_id || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: account_id, amount'
      });
    }

    // Validate amount is positive
    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be greater than 0'
      });
    }

    // Check account exists
    const account = await accountRepository.findById(account_id);
    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    // Process payment using existing service method
    const transaction = await transactionService.processPayment(account_id, amount);

    res.json({
      success: true,
      transaction_id: transaction.id,
      new_balance: transaction.new_balance,
      amount_paid: amount,
      previous_balance: transaction.previous_balance
    });

  } catch (error) {
    console.error('Error processing payment:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * Get payment history for an account
 *
 * GET /payments/:accountId
 *
 * Response:
 * {
 *   "account_id": "account_123",
 *   "payments": [...]
 * }
 */
router.get('/:accountId', async (req, res) => {
  try {
    const transactionRepository = require('../repositories/transactionRepository');

    const payments = await transactionRepository.findByAccountId(req.params.accountId, 100);

    // Filter only payment transactions
    const paymentTransactions = payments.filter(t => t.transaction_type === 'payment');

    res.json({
      account_id: req.params.accountId,
      count: paymentTransactions.length,
      payments: paymentTransactions
    });

  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router;
