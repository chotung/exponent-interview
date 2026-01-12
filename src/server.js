require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const transactionService = require('./services/transactionService');
const db = require('./db/connection');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet()); // Security headers
app.use(morgan('combined')); // HTTP request logging
app.use(express.json()); // Parse JSON request bodies

/**
 * Health check endpoint
 * Used by Kubernetes liveness and readiness probes
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * Readiness check endpoint
 * Checks database connectivity
 */
app.get('/ready', (req, res) => {
  try {
    // Test database connection
    db.get('SELECT 1 as test', []);
    res.json({
      status: 'ready',
      database: 'connected'
    });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      database: 'disconnected',
      error: error.message
    });
  }
});

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
app.post('/webhooks/transactions', (req, res) => {
  try {
    const webhookData = req.body;

    // Validate required fields
    if (!webhookData.id || !webhookData.card_id || !webhookData.amount) {
      return res.status(400).json({
        approved: false,
        error: 'Missing required fields: id, card_id, amount'
      });
    }

    // Authorize transaction
    const result = transactionService.authorizeTransaction(webhookData);

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

/**
 * Get account details (for testing/debugging)
 * GET /accounts/:accountId
 */
app.get('/accounts/:accountId', (req, res) => {
  try {
    const accountRepository = require('./repositories/accountRepository');
    const account = accountRepository.findById(req.params.accountId);

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
app.get('/accounts/:accountId/transactions', (req, res) => {
  try {
    const transactionRepository = require('./repositories/transactionRepository');
    const limit = parseInt(req.query.limit || '50');
    const transactions = transactionRepository.findByAccountId(req.params.accountId, limit);

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

/**
 * 404 handler
 */
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path
  });
});

/**
 * Global error handler
 */
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

/**
 * Start server
 */
function startServer() {
  // Run migrations on startup
  const migrate = require('./db/migrate');
  migrate()
    .then(() => {
      app.listen(PORT, '0.0.0.0', () => {
        console.log('═══════════════════════════════════════════════');
        console.log('  Credit Card Transaction Platform');
        console.log('═══════════════════════════════════════════════');
        console.log(`✓ Server running on port ${PORT}`);
        console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`✓ Database: ${process.env.DATABASE_TYPE || 'sqlite'}`);
        console.log('');
        console.log('Endpoints:');
        console.log(`  POST http://localhost:${PORT}/webhooks/transactions`);
        console.log(`  GET  http://localhost:${PORT}/health`);
        console.log(`  GET  http://localhost:${PORT}/ready`);
        console.log('═══════════════════════════════════════════════');
      });
    })
    .catch((error) => {
      console.error('Failed to start server:', error);
      process.exit(1);
    });
}

// Start server if called directly
if (require.main === module) {
  startServer();
}

module.exports = app;
