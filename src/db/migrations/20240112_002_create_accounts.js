/**
 * Migration: Create accounts table
 */

exports.up = function(knex) {
  return knex.schema.createTable('accounts', table => {
    table.string('id').primary();
    table.string('user_id').notNullable();
    table.string('account_number').unique().notNullable();
    table.decimal('credit_limit', 12, 2).notNullable().defaultTo(0.00);
    table.decimal('current_balance', 12, 2).notNullable().defaultTo(0.00);
    table.decimal('apr_rate', 5, 2).defaultTo(19.99);
    table.integer('statement_closing_day').checkBetween([1, 28]);
    table.integer('payment_due_day').checkBetween([1, 28]);
    table.decimal('minimum_payment_percentage', 5, 2).defaultTo(2.00);
    table.string('status').defaultTo('active');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Foreign keys
    table.foreign('user_id').references('users.id').onDelete('CASCADE');

    // Indexes
    table.index('user_id');
    table.index('status');

    // Constraints
    table.check('credit_limit >= 0', [], 'positive_credit_limit');
    table.check('current_balance >= 0', [], 'valid_balance');
    table.check("status IN ('active', 'suspended', 'closed')", [], 'valid_status');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('accounts');
};
