const express = require('express');
const router = express.Router();
const accountRepository = require('../repositories/accountRepository');
const transactionRepository = require('../repositories/transactionRepository');

/**
 * Get account details (for testing/debugging)
 * GET /accounts/:accountId
 */
router.get('/:accountId', async (req, res) => {
  try {
    const account = await accountRepository.findById(req.params.accountId);

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json(account);
  } catch (error) {
    console.error('Error fetching account:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get account transactions (for testing/debugging)
 * GET /accounts/:accountId/transactions
 */
router.get('/:accountId/transactions', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '50');
    const transactions = await transactionRepository.findByAccountId(req.params.accountId, limit);

    res.json({
      account_id: req.params.accountId,
      count: transactions.length,
      transactions
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
