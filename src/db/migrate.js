const fs = require('fs');
const path = require('path');
const db = require('./connection');

/**
 * Database migration script
 *
 * Runs schema.sql to create all tables and indexes
 * Safe to run multiple times (uses IF NOT EXISTS)
 */

async function runMigration() {
  try {
    console.log('Starting database migration...');

    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Split by semicolons to handle multiple statements
    const statements = schema
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    for (const statement of statements) {
      try {
        // For SQLite (synchronous)
        if (db.run) {
          db.run(statement, []);
        } else {
          // For PostgreSQL (async)
          await db.query(statement);
        }
      } catch (error) {
        // Skip errors for CREATE statements that already exist
        if (!error.message.includes('already exists')) {
          console.error('Error executing statement:', statement.substring(0, 100));
          throw error;
        }
      }
    }

    console.log('✓ Database migration completed successfully');
    console.log('✓ All tables and indexes created');

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run migration if called directly
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('Migration complete. Exiting...');
      process.exit(0);
    })
    .catch(error => {
      console.error('Migration error:', error);
      process.exit(1);
    });
}

module.exports = runMigration;
