require('dotenv').config();

/**
 * Database configuration
 *
 * For development: Uses SQLite with better-sqlite3 (synchronous, fast)
 * For production: Swap to PostgreSQL by setting DATABASE_TYPE=postgres
 *
 * To switch to PostgreSQL:
 * 1. Set DATABASE_TYPE=postgres in environment
 * 2. Provide DATABASE_URL or individual connection params
 * 3. Update queries to use parameterized queries ($1, $2) instead of ?
 * 4. Handle async/await for all database operations
 */

const DATABASE_TYPE = process.env.DATABASE_TYPE || 'sqlite';

const config = {
  type: DATABASE_TYPE,

  // SQLite configuration (development)
  sqlite: {
    filename: process.env.SQLITE_DB_PATH || './data/credit_card.db',
    // Options for better-sqlite3
    options: {
      verbose: process.env.NODE_ENV === 'development' ? console.log : null,
      fileMustExist: false
    }
  },

  // PostgreSQL configuration (production)
  postgres: {
    // Option 1: Use connection string
    connectionString: process.env.DATABASE_URL,

    // Option 2: Individual connection parameters
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'credit_card_platform',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,

    // Connection pool settings
    max: parseInt(process.env.DB_POOL_MAX || '20'),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,

    // SSL for production (AWS RDS, etc.)
    ssl: process.env.DB_SSL === 'true' ? {
      rejectUnauthorized: false
    } : false
  }
};

module.exports = config;
