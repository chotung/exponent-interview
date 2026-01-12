require('dotenv').config();

/**
 * Knex Migration Configuration
 *
 * This file configures how Knex handles database migrations
 * Run migrations with: npx knex migrate:latest
 * Rollback with: npx knex migrate:rollback
 * Create new migration: npx knex migrate:make migration_name
 */

const config = require('./src/db/config');

module.exports = {
  // Development environment (SQLite)
  development: {
    client: 'better-sqlite3',
    connection: {
      filename: config.sqlite.filename
    },
    useNullAsDefault: true,
    migrations: {
      directory: './src/db/migrations',
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: './src/db/seeds'
    }
  },

  // Production environment (PostgreSQL)
  production: {
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
    },
    seeds: {
      directory: './src/db/seeds'
    }
  }
};
