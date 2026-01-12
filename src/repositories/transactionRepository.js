const db = require('../db/connection');

/**
 * Transaction Repository
 *
 * Handles all transaction-related database operations
 * Works with both SQLite and PostgreSQL
 */

class TransactionRepository {
  /**
   * Find transaction by ID
   * @param {string} transactionId
   * @returns {Object|null} Transaction object or null if not found
   */
  findById(transactionId) {
    const sql = `
      SELECT t.*, m.name as merchant_name_full
      FROM transactions t
      LEFT JOIN merchants m ON t.merchant_id = m.id
      WHERE t.id = ?
    `;

    return db.get(sql, [transactionId]);
  }

  /**
   * Find all transactions for an account
   * @param {string} accountId
   * @param {number} limit
   * @returns {Array} Array of transaction objects
   */
  findByAccountId(accountId, limit = 100) {
    const sql = `
      SELECT * FROM transactions
      WHERE account_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `;

    return db.query(sql, [accountId, limit]);
  }

  /**
   * Create a new transaction
   * @param {Object} transactionData
   * @returns {Object} Created transaction
   */
  create(transactionData) {
    const sql = `
      INSERT INTO transactions (
        id, card_id, account_id, merchant_id, amount, currency,
        transaction_type, status, previous_balance, new_balance,
        authorization_code, decline_reason, merchant_category_code,
        merchant_name, merchant_address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      transactionData.id,
      transactionData.card_id,
      transactionData.account_id,
      transactionData.merchant_id || null,
      transactionData.amount,
      transactionData.currency || 'usd',
      transactionData.transaction_type || 'purchase',
      transactionData.status || 'pending',
      transactionData.previous_balance,
      transactionData.new_balance,
      transactionData.authorization_code || null,
      transactionData.decline_reason || null,
      transactionData.merchant_category_code || null,
      transactionData.merchant_name || null,
      transactionData.merchant_address ? JSON.stringify(transactionData.merchant_address) : null
    ];

    db.run(sql, params);
    return this.findById(transactionData.id);
  }

  /**
   * Update transaction status
   * @param {string} transactionId
   * @param {string} status - pending, posted, declined, reversed
   * @returns {Object} Updated transaction
   */
  updateStatus(transactionId, status) {
    const sql = `
      UPDATE transactions
      SET status = ?,
          posted_at = CASE WHEN ? = 'posted' THEN CURRENT_TIMESTAMP ELSE posted_at END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    db.run(sql, [status, status, transactionId]);
    return this.findById(transactionId);
  }

  /**
   * Get total spending by merchant category
   * @param {string} accountId
   * @param {number} days - Number of days to look back
   * @returns {Array} Array of {category, total}
   */
  getSpendingByCategory(accountId, days = 30) {
    const sql = `
      SELECT merchant_category_code, SUM(amount) as total
      FROM transactions
      WHERE account_id = ?
        AND status = 'posted'
        AND transaction_type = 'purchase'
        AND created_at >= datetime('now', '-' || ? || ' days')
      GROUP BY merchant_category_code
      ORDER BY total DESC
    `;

    return db.query(sql, [accountId, days]);
  }

  /**
   * Check if transaction ID already exists (prevent duplicates)
   * @param {string} transactionId
   * @returns {boolean}
   */
  exists(transactionId) {
    const sql = `SELECT COUNT(*) as count FROM transactions WHERE id = ?`;
    const result = db.get(sql, [transactionId]);
    return result.count > 0;
  }
}

module.exports = new TransactionRepository();
