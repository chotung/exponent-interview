const express = require('express');
const router = express.Router();
const statementService = require('../services/statementService');

/**
 * Generate statements manually (for testing or admin use)
 *
 * POST /statements/generate
 *
 * Response:
 * {
 *   "success": true,
 *   "generated_count": 5,
 *   "skipped_count": 2
 * }
 */
router.post('/generate', async (req, res) => {
  try {
    const result = await statementService.generateMonthlyStatements();

    res.json({
      success: true,
      generated_count: result.generated_count,
      skipped_count: result.skipped_count
    });

  } catch (error) {
    console.error('Error generating statements:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * Get all statements for an account
 *
 * GET /statements/account/:accountId
 *
 * Response:
 * {
 *   "account_id": "account_123",
 *   "count": 3,
 *   "statements": [...]
 * }
 */
router.get('/account/:accountId', async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : undefined;
    const statements = await statementService.getStatementsForAccount(req.params.accountId, limit);

    res.json(statements);

  } catch (error) {
    console.error('Error fetching statements:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Get a specific statement
 *
 * GET /statements/:statementId
 *
 * Response:
 * {
 *   "id": "statement_123",
 *   "account_id": "account_456",
 *   ...
 * }
 */
router.get('/:statementId', async (req, res) => {
  try {
    const statement = await statementService.getStatement(req.params.statementId);

    if (!statement) {
      return res.status(404).json({
        success: false,
        error: 'Statement not found'
      });
    }

    res.json(statement);

  } catch (error) {
    console.error('Error fetching statement:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router;
