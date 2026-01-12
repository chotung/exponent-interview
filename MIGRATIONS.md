# Database Migrations Guide

## Overview

We use **Knex.js** for database migrations, which provides:
- ✅ **Versioned migrations** - Track which migrations have run
- ✅ **Rollback support** - Undo migrations if needed
- ✅ **Up/Down migrations** - Forward and backward migration scripts
- ✅ **Migration history** - Stored in `knex_migrations` table
- ✅ **Works with SQLite and PostgreSQL** - No code changes needed

## Migration Commands

### Run Migrations
```bash
# Run all pending migrations
npm run migrate

# Or directly with Knex CLI
npx knex migrate:latest
```

### Check Migration Status
```bash
# See which migrations have run
npm run migrate:status
```

### Create New Migration
```bash
# Create a new migration file
npm run migrate:make add_user_phone_number

# Creates: src/db/migrations/YYYYMMDD_HHmmss_add_user_phone_number.js
```

### Rollback Migrations
```bash
# Rollback the last batch of migrations
npm run migrate:rollback

# Rollback all migrations
npx knex migrate:rollback --all
```

## Migration File Structure

Migrations are located in `src/db/migrations/` and follow this format:

```javascript
/**
 * Migration: Add phone number to users
 */

// Run when migrating forward
exports.up = function(knex) {
  return knex.schema.table('users', table => {
    table.string('phone_number');
  });
};

// Run when rolling back
exports.down = function(knex) {
  return knex.schema.table('users', table => {
    table.dropColumn('phone_number');
  });
};
```

## Current Migrations

1. **20240112_001_create_users.js** - Create users table
2. **20240112_002_create_accounts.js** - Create accounts table
3. **20240112_003_create_cards.js** - Create cards table
4. **20240112_004_create_merchants_and_transactions.js** - Create merchants and transactions tables
5. **20240112_005_create_statements.js** - Create statements table

## Migration Best Practices

### 1. Always Provide Up and Down
```javascript
// ✅ Good - Can rollback
exports.up = (knex) => knex.schema.createTable('foo', ...);
exports.down = (knex) => knex.schema.dropTableIfExists('foo');

// ❌ Bad - Can't rollback
exports.up = (knex) => knex.schema.createTable('foo', ...);
exports.down = () => {};
```

### 2. Use Transactions for Multiple Operations
```javascript
exports.up = async function(knex) {
  await knex.schema.createTable('table1', ...);
  await knex.schema.createTable('table2', ...);
  // Knex automatically wraps in transaction
};
```

### 3. Make Migrations Idempotent
```javascript
// ✅ Good - Safe to run multiple times
exports.up = (knex) => knex.schema.createTableIfNotExists('foo', ...);

// ❌ Bad - Fails if table exists
exports.up = (knex) => knex.schema.createTable('foo', ...);
```

### 4. Name Migrations Descriptively
```bash
✅ Good:
  20240112_add_user_email_index.js
  20240113_create_payments_table.js
  20240114_add_card_spending_limits.js

❌ Bad:
  migration1.js
  update.js
  fix.js
```

## Common Migration Operations

### Add Column
```javascript
exports.up = (knex) => {
  return knex.schema.table('users', table => {
    table.string('phone_number');
  });
};

exports.down = (knex) => {
  return knex.schema.table('users', table => {
    table.dropColumn('phone_number');
  });
};
```

### Add Index
```javascript
exports.up = (knex) => {
  return knex.schema.table('users', table => {
    table.index('email');
  });
};

exports.down = (knex) => {
  return knex.schema.table('users', table => {
    table.dropIndex('email');
  });
};
```

### Add Foreign Key
```javascript
exports.up = (knex) => {
  return knex.schema.table('cards', table => {
    table.foreign('user_id').references('users.id');
  });
};

exports.down = (knex) => {
  return knex.schema.table('cards', table => {
    table.dropForeign('user_id');
  });
};
```

### Rename Column
```javascript
exports.up = (knex) => {
  return knex.schema.table('users', table => {
    table.renameColumn('name', 'full_name');
  });
};

exports.down = (knex) => {
  return knex.schema.table('users', table => {
    table.renameColumn('full_name', 'name');
  });
};
```

### Data Migration
```javascript
exports.up = async function(knex) {
  // Update existing records
  await knex('users')
    .where('status', 'inactive')
    .update({ status: 'suspended' });
};

exports.down = async function(knex) {
  // Revert the changes
  await knex('users')
    .where('status', 'suspended')
    .update({ status: 'inactive' });
};
```

## Production Deployment

### Option 1: Run migrations on server startup (current)
```javascript
// server.js automatically runs migrations
await knex.migrate.latest();
```

**Pros**: Automatic, zero-downtime
**Cons**: Multiple instances might race

### Option 2: Run migrations manually before deployment
```bash
# On production server
NODE_ENV=production npm run migrate

# Then start the app
npm start
```

**Pros**: More control, no races
**Cons**: Requires manual step

### Option 3: Use CI/CD pipeline
```yaml
# .github/workflows/deploy.yml
- name: Run migrations
  run: npm run migrate
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}

- name: Deploy application
  run: ./deploy.sh
```

**Pros**: Automated, consistent
**Cons**: Requires CI/CD setup

## Troubleshooting

### Migration Failed Halfway
```bash
# Check status
npm run migrate:status

# Rollback the failed batch
npm run migrate:rollback

# Fix the migration file
# Run again
npm run migrate
```

### Migration Table Locked
```bash
# SQLite: Close all connections
# PostgreSQL: Check for long-running transactions
SELECT * FROM pg_stat_activity WHERE state = 'active';
```

### Wrong Migration Order
```bash
# Rollback all
npx knex migrate:rollback --all

# Rename migration files to fix order
mv 20240112_002_foo.js 20240112_001_foo.js

# Run again
npm run migrate
```

## Migration vs Seed Data

**Migrations**: Schema changes (tables, columns, indexes)
```javascript
// src/db/migrations/20240112_001_create_users.js
exports.up = (knex) => knex.schema.createTable('users', ...);
```

**Seeds**: Sample/test data
```javascript
// src/db/seeds/01_sample_users.js
exports.seed = async (knex) => {
  await knex('users').insert([
    { email: 'test@example.com', ... }
  ]);
};
```

## Legacy Migration (schema.sql)

The old `src/db/migrate.js` is kept for backward compatibility:

```bash
# Run legacy migration (not recommended)
npm run migrate:legacy
```

**Should you use it?** No. Use Knex migrations instead for:
- Version control
- Rollback capability
- Production safety
