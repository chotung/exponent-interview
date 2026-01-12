require('dotenv').config();
const config = require('./config');

/**
 * Knex Query Builder Configuration
 *
 * Knex abstracts the differences between SQLite and PostgreSQL:
 * - Handles parameter placeholders (? vs $1, $2, $3)
 * - Provides chainable query builder
 * - Easy to drop down to raw SQL when needed
 *
 * Migration path: If you want to remove Knex later, just use knex.raw()
 * which gives you back the same raw SQL interface you had before.
 */

let knexInstance = null;

function initializeKnex() {
  const knex = require('knex');

  if (config.type === 'sqlite') {
    // SQLite configuration
    knexInstance = knex({
      client: 'better-sqlite3',
      connection: {
        filename: config.sqlite.filename
      },
      useNullAsDefault: true, // SQLite requires this
      pool: {
        afterCreate: (conn, cb) => {
          // Enable foreign keys for SQLite
          conn.pragma('foreign_keys = ON');
          cb();
        }
      },
      migrations: {
        directory: './src/db/migrations',
        tableName: 'knex_migrations'
      }
    });

    console.log(`✓ Knex connected to SQLite: ${config.sqlite.filename}`);

  } else if (config.type === 'postgres') {
    // PostgreSQL configuration
    knexInstance = knex({
      client: 'pg',
      connection: config.postgres.connectionString || {
        host: config.postgres.host,
        port: config.postgres.port,
        database: config.postgres.database,
        user: config.postgres.user,
        password: config.postgres.password,
        ssl: config.postgres.ssl
      },
      pool: {
        min: 2,
        max: config.postgres.max
      },
      migrations: {
        directory: './src/db/migrations',
        tableName: 'knex_migrations'
      }
    });

    console.log(`✓ Knex connected to PostgreSQL: ${config.postgres.database}`);

  } else {
    throw new Error(`Unsupported database type: ${config.type}`);
  }

  return knexInstance;
}

/**
 * Get or create Knex instance
 */
function getKnex() {
  if (!knexInstance) {
    knexInstance = initializeKnex();
  }
  return knexInstance;
}

/**
 * Close database connection (for graceful shutdown)
 */
async function closeKnex() {
  if (knexInstance) {
    await knexInstance.destroy();
    knexInstance = null;
    console.log('✓ Knex connection closed');
  }
}

module.exports = getKnex();
module.exports.closeKnex = closeKnex;
