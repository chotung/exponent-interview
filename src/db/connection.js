const config = require('./config');

/**
 * Database connection manager
 *
 * Abstracts SQLite vs PostgreSQL to allow easy swapping
 *
 * Usage:
 *   const db = require('./db/connection');
 *   db.query('SELECT * FROM users WHERE id = ?', [userId]);
 *
 * When switching to PostgreSQL:
 *   - SQLite uses ? for parameters
 *   - PostgreSQL uses $1, $2, $3 for parameters
 *   - You'll need to update parameter placeholders in queries
 */

let dbConnection = null;

function initializeSQLite() {
  const Database = require('better-sqlite3');
  const db = new Database(config.sqlite.filename, config.sqlite.options);

  // Enable foreign keys for SQLite
  db.pragma('foreign_keys = ON');

  console.log(`✓ Connected to SQLite database: ${config.sqlite.filename}`);

  return {
    query: (sql, params = []) => {
      // Execute query and return results
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        const stmt = db.prepare(sql);
        return stmt.all(...params);
      } else {
        const stmt = db.prepare(sql);
        return stmt.run(...params);
      }
    },
    get: (sql, params = []) => {
      const stmt = db.prepare(sql);
      return stmt.get(...params);
    },
    run: (sql, params = []) => {
      const stmt = db.prepare(sql);
      return stmt.run(...params);
    },
    transaction: (fn) => {
      return db.transaction(fn)();
    },
    close: () => {
      db.close();
    },
    raw: db // Access to raw database for advanced operations
  };
}

function initializePostgreSQL() {
  const { Pool } = require('pg');

  const pool = new Pool(
    config.postgres.connectionString
      ? { connectionString: config.postgres.connectionString, ssl: config.postgres.ssl }
      : {
          host: config.postgres.host,
          port: config.postgres.port,
          database: config.postgres.database,
          user: config.postgres.user,
          password: config.postgres.password,
          max: config.postgres.max,
          idleTimeoutMillis: config.postgres.idleTimeoutMillis,
          connectionTimeoutMillis: config.postgres.connectionTimeoutMillis,
          ssl: config.postgres.ssl
        }
  );

  console.log(`✓ Connected to PostgreSQL database: ${config.postgres.database}`);

  return {
    query: async (sql, params = []) => {
      const result = await pool.query(sql, params);
      return result.rows;
    },
    get: async (sql, params = []) => {
      const result = await pool.query(sql, params);
      return result.rows[0];
    },
    run: async (sql, params = []) => {
      const result = await pool.query(sql, params);
      return result;
    },
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    close: async () => {
      await pool.end();
    },
    raw: pool
  };
}

function getConnection() {
  if (!dbConnection) {
    if (config.type === 'sqlite') {
      dbConnection = initializeSQLite();
    } else if (config.type === 'postgres') {
      dbConnection = initializePostgreSQL();
    } else {
      throw new Error(`Unsupported database type: ${config.type}`);
    }
  }
  return dbConnection;
}

module.exports = getConnection();
