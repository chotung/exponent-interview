const db = require('../db/connection');

/**
 * Card Repository
 *
 * Handles all card-related database operations
 * Works with both SQLite and PostgreSQL
 */

class CardRepository {
  /**
   * Find card by ID
   * @param {string} cardId
   * @returns {Object|null} Card object or null if not found
   */
  findById(cardId) {
    const sql = `
      SELECT c.*, a.credit_limit, a.current_balance, a.status as account_status
      FROM cards c
      JOIN accounts a ON c.account_id = a.id
      WHERE c.id = ?
    `;

    // Note: For PostgreSQL, change ? to $1, $2, etc.
    return db.get(sql, [cardId]);
  }

  /**
   * Find all cards for an account
   * @param {string} accountId
   * @returns {Array} Array of card objects
   */
  findByAccountId(accountId) {
    const sql = `
      SELECT * FROM cards
      WHERE account_id = ?
      ORDER BY created_at DESC
    `;

    return db.query(sql, [accountId]);
  }

  /**
   * Create a new card
   * @param {Object} cardData
   * @returns {Object} Created card
   */
  create(cardData) {
    const sql = `
      INSERT INTO cards (
        id, account_id, card_number_last_four, card_hash,
        expiry_month, expiry_year, card_type, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      cardData.id,
      cardData.account_id,
      cardData.card_number_last_four,
      cardData.card_hash,
      cardData.expiry_month,
      cardData.expiry_year,
      cardData.card_type || 'physical',
      cardData.status || 'active'
    ];

    db.run(sql, params);
    return this.findById(cardData.id);
  }

  /**
   * Update card status
   * @param {string} cardId
   * @param {string} status - active, frozen, lost, stolen, closed
   * @returns {Object} Updated card
   */
  updateStatus(cardId, status) {
    const sql = `
      UPDATE cards
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    db.run(sql, [status, cardId]);
    return this.findById(cardId);
  }
}

module.exports = new CardRepository();
