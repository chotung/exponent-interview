/**
 * Migration: Create merchants and transactions tables
 */

exports.up = async function(knex) {
  // Create merchants table
  await knex.schema.createTable('merchants', table => {
    table.string('id').primary();
    table.string('name');
    table.integer('merchant_category_code').notNullable();
    table.string('address_line_1');
    table.string('address_line_2');
    table.string('city', 100);
    table.string('state', 50);
    table.string('country', 2);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Indexes
    table.index('merchant_category_code');
    table.index('name');
  });

  // Create transactions table
  await knex.schema.createTable('transactions', table => {
    table.string('id').primary();
    table.string('card_id').notNullable();
    table.string('account_id').notNullable();
    table.string('merchant_id');
    table.decimal('amount', 12, 2).notNullable();
    table.string('currency', 3).defaultTo('usd');
    table.string('transaction_type').defaultTo('purchase');
    table.string('status').defaultTo('pending');
    table.decimal('previous_balance', 12, 2).notNullable();
    table.decimal('new_balance', 12, 2).notNullable();
    table.string('authorization_code', 50);
    table.string('decline_reason');
    table.integer('merchant_category_code');
    table.string('merchant_name');
    table.text('merchant_address'); // JSON string
    table.string('statement_id');
    table.timestamp('posted_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Foreign keys
    table.foreign('card_id').references('cards.id');
    table.foreign('account_id').references('accounts.id');
    table.foreign('merchant_id').references('merchants.id');

    // Indexes
    table.index('card_id');
    table.index('account_id');
    table.index('merchant_id');
    table.index('status');
    table.index('created_at');

    // Constraints
    table.check("transaction_type IN ('purchase', 'payment', 'refund', 'fee', 'interest', 'adjustment')", [], 'valid_transaction_type');
    table.check("status IN ('pending', 'posted', 'declined', 'reversed')", [], 'valid_status');
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('transactions');
  await knex.schema.dropTableIfExists('merchants');
};
