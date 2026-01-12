/**
 * Jest Setup
 * Runs before all tests
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_TYPE = 'sqlite';
process.env.SQLITE_DB_PATH = ':memory:'; // In-memory SQLite for tests

// Increase timeout for database operations
jest.setTimeout(10000);

// Global test cleanup
afterAll(async () => {
  // Close database connections
  const knex = require('./src/db/knex');
  if (knex && knex.destroy) {
    await knex.destroy();
  }
});
