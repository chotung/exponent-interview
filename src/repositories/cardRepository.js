const knex = require('../db/knex');

/**
 * Card Repository - Knex Version
 *
 * Handles all card-related database operations using Knex query builder
 *
 * Benefits of Knex:
 * - No more ? vs $1 parameter placeholder issues
 * - Chainable, readable queries
 * - Works with both SQLite and PostgreSQL without changes
 * - Easy escape hatch to raw SQL when needed
 *
 * Migration path:
 * If you want to remove Knex later, just use knex.raw() for raw SQL queries
 */

class CardRepository {
  /**
   * Find card by ID with account information
   * @param {string} cardId
   * @returns {Promise<Object|null>} Card object or null if not found
   */
  async findById(cardId) {
    // Knex query builder - much cleaner than raw SQL
    return knex('cards as c')
      .select(
        'c.*',
        'a.credit_limit',
        'a.current_balance',
        'a.status as account_status'
      )
      .join('accounts as a', 'c.account_id', 'a.id')
      .where('c.id', cardId)
      .first(); // Returns single row or undefined

    // Alternative: Drop down to raw SQL if needed (easy escape hatch)
    // return knex.raw(`
    //   SELECT c.*, a.credit_limit, a.current_balance, a.status as account_status
    //   FROM cards c
    //   JOIN accounts a ON c.account_id = a.id
    //   WHERE c.id = ?
    // `, [cardId]).then(result => result[0]);
  }

  /**
   * Find all cards for an account
   * @param {string} accountId
   * @returns {Promise<Array>} Array of card objects
   */
  async findByAccountId(accountId) {
    return knex('cards')
      .where({ account_id: accountId })
      .orderBy('created_at', 'desc');
  }

  /**
   * Create a new card
   * @param {Object} cardData
   * @returns {Promise<Object>} Created card
   */
  async create(cardData) {
    // Knex automatically handles INSERT and returns the created record
    await knex('cards').insert({
      id: cardData.id,
      account_id: cardData.account_id,
      card_number_last_four: cardData.card_number_last_four,
      card_hash: cardData.card_hash,
      expiry_month: cardData.expiry_month,
      expiry_year: cardData.expiry_year,
      card_type: cardData.card_type || 'physical',
      status: cardData.status || 'active'
    });

    return this.findById(cardData.id);
  }

  /**
   * Update card status
   * @param {string} cardId
   * @param {string} status - active, frozen, lost, stolen, closed
   * @returns {Promise<Object>} Updated card
   */
  async updateStatus(cardId, status) {
    await knex('cards')
      .where({ id: cardId })
      .update({
        status: status,
        updated_at: knex.fn.now() // Cross-database current timestamp
      });

    return this.findById(cardId);
  }

  /**
   * Example: Complex query with raw SQL escape hatch
   * Shows how easy it is to drop to raw SQL when needed
   */
  async findWithComplexCriteria(criteria) {
    // If query gets complex, just use raw SQL
    return knex.raw(`
      SELECT c.*, a.credit_limit,
        CASE
          WHEN c.status = 'active' AND a.status = 'active' THEN 'operational'
          ELSE 'inactive'
        END as operational_status
      FROM cards c
      JOIN accounts a ON c.account_id = a.id
      WHERE c.status IN (?, ?)
        AND a.credit_limit > ?
    `, [criteria.status1, criteria.status2, criteria.minLimit]);
  }

  /**
   * Example: Transaction support
   * Knex makes transactions easy across both databases
   */
  async createWithTransaction(cardData, accountUpdate) {
    return knex.transaction(async (trx) => {
      // Insert card
      await trx('cards').insert(cardData);

      // Update account in same transaction
      await trx('accounts')
        .where({ id: cardData.account_id })
        .update(accountUpdate);

      return this.findById(cardData.id);
    });
  }
}

module.exports = new CardRepository();
