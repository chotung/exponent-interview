require('dotenv').config();
require('./cron/statement.cron');

const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const knex = require('./db/knex');

// Import routes
const webhookRoutes = require('./routes/webhooks');
const accountRoutes = require('./routes/accounts');
const paymentRoutes = require('./routes/payments');
const statementRoutes = require('./routes/statements');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// Middleware
// ============================================================================
app.use(helmet()); // Security headers
app.use(morgan('combined')); // HTTP request logging
app.use(express.json()); // Parse JSON request bodies

// ============================================================================
// Health Check Endpoints (for Kubernetes probes)
// ============================================================================

/**
 * Health check endpoint
 * Used by Kubernetes liveness probe
 */
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * Readiness check endpoint
 * Checks database connectivity
 * Used by Kubernetes readiness probe
 */
app.get('/ready', async (_req, res) => {
  try {
    // Test database connection with Knex
    await knex.raw('SELECT 1 as test');
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

// ============================================================================
// API Routes
// ============================================================================
app.use('/webhooks', webhookRoutes);
app.use('/accounts', accountRoutes);
app.use('/payments', paymentRoutes);
app.use('/statements', statementRoutes);

// ============================================================================
// Error Handlers
// ============================================================================

/**
 * 404 handler
 */
app.use((_req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: _req.path
  });
});

/**
 * Global error handler
 */
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ============================================================================
// Server Startup
// ============================================================================

/**
 * Start server with database migration
 */
async function startServer() {
  try {
    // Run Knex migrations on startup
    console.log('Running database migrations...');
    await knex.migrate.latest();
    console.log('✓ Database migrations completed');

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
      console.log(`  POST http://localhost:${PORT}/webhooks/settlements`);
      console.log(`  POST http://localhost:${PORT}/payments`);
      console.log(`  GET  http://localhost:${PORT}/accounts/:accountId`);
      console.log(`  GET  http://localhost:${PORT}/health`);
      console.log(`  GET  http://localhost:${PORT}/ready`);
      console.log('═══════════════════════════════════════════════');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start server if called directly
if (require.main === module) {
  startServer();
}

module.exports = app;
