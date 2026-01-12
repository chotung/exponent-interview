/**
 * Migration: Create statements table
 */

exports.up = function(knex) {
  return knex.schema.createTable('statements', table => {
    table.string('id').primary();
    table.string('account_id').notNullable();
    table.date('statement_date').notNullable();
    table.decimal('closing_balance', 12, 2).notNullable().defaultTo(0.00);
    table.decimal('previous_balance', 12, 2).notNullable().defaultTo(0.00);
    table.decimal('total_purchases', 12, 2).notNullable().defaultTo(0.00);
    table.decimal('total_payments', 12, 2).notNullable().defaultTo(0.00);
    table.decimal('total_fees', 12, 2).notNullable().defaultTo(0.00);
    table.decimal('total_interest', 12, 2).notNullable().defaultTo(0.00);
    table.decimal('minimum_payment_due', 12, 2).notNullable().defaultTo(0.00);
    table.date('payment_due_date').notNullable();
    table.string('status').defaultTo('generated');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Foreign keys
    table.foreign('account_id').references('accounts.id').onDelete('CASCADE');

    // Indexes
    table.index('account_id');
    table.index('payment_due_date');
    table.index('status');

    // Constraints
    table.unique(['account_id', 'statement_date']);
    table.check("status IN ('generated', 'sent', 'paid', 'overdue')", [], 'valid_status');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('statements');
};
