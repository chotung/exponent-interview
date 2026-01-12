/**
 * Migration: Create cards table
 */

exports.up = function(knex) {
  return knex.schema.createTable('cards', table => {
    table.string('id').primary();
    table.string('account_id').notNullable();
    table.string('card_number_last_four', 4).notNullable();
    table.string('card_hash', 64).unique().notNullable();
    table.integer('expiry_month').checkBetween([1, 12]);
    table.integer('expiry_year');
    table.string('card_type').defaultTo('physical');
    table.decimal('spending_limit', 12, 2);
    table.string('status').defaultTo('active');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Foreign keys
    table.foreign('account_id').references('accounts.id').onDelete('CASCADE');

    // Indexes
    table.index('account_id');
    table.index('status');

    // Constraints
    table.check("card_type IN ('physical', 'virtual')", [], 'valid_card_type');
    table.check("status IN ('active', 'frozen', 'lost', 'stolen', 'closed')", [], 'valid_card_status');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('cards');
};
