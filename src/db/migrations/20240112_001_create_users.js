/**
 * Migration: Create users table
 *
 * Run: npx knex migrate:latest
 * Rollback: npx knex migrate:rollback
 */

exports.up = function(knex) {
  return knex.schema.createTable('users', table => {
    table.string('id').primary();
    table.string('email').unique().notNullable();
    table.string('first_name').notNullable();
    table.string('last_name').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('users');
};
