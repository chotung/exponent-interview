const db = require('../db/connection');

/**
 * Account Repository
 *
 * Handles all account-related database operations
 * Works with both SQLite and PostgreSQL
 */

class AccountRepository {
  /**
   * Find account by ID
   * @param {string} accountId
   * @returns {Object|null} Account object or null if not found
   */
  findById(accountId) {
    const sql = `
      SELECT *,
        (credit_limit - current_balance) as available_credit
      FROM accounts
      WHERE id = ?
    `;

    return db.get(sql, [accountId]);
  }

  /**
   * Find all accounts for a user
   * @param {string} userId
   * @returns {Array} Array of account objects
   */
  findByUserId(userId) {
    const sql = `
      SELECT *,
        (credit_limit - current_balance) as available_credit
      FROM accounts
      WHERE user_id = ?
      ORDER BY created_at DESC
    `;

    return db.query(sql, [userId]);
  }

  /**
   * Update account balance
   * @param {string} accountId
   * @param {number} newBalance
   * @returns {Object} Updated account
   */
  updateBalance(accountId, newBalance) {
    const sql = `
      UPDATE accounts
      SET current_balance = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    db.run(sql, [newBalance, accountId]);
    return this.findById(accountId);
  }

  /**
   * Update account balance within a transaction
   * Used by transaction service to ensure atomicity
   * @param {string} accountId
   * @param {number} amount - Amount to add (positive) or subtract (negative)
   * @returns {number} New balance
   */
  incrementBalance(accountId, amount) {
    const sql = `
      UPDATE accounts
      SET current_balance = current_balance + ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    db.run(sql, [amount, accountId]);

    const account = this.findById(accountId);
    return account.current_balance;
  }

  /**
   * Create a new account
   * @param {Object} accountData
   * @returns {Object} Created account
   */
  create(accountData) {
    const sql = `
      INSERT INTO accounts (
        id, user_id, account_number, credit_limit, current_balance,
        apr_rate, statement_closing_day, payment_due_day, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      accountData.id,
      accountData.user_id,
      accountData.account_number,
      accountData.credit_limit || 0,
      accountData.current_balance || 0,
      accountData.apr_rate || 19.99,
      accountData.statement_closing_day || 1,
      accountData.payment_due_day || 21,
      accountData.status || 'active'
    ];

    db.run(sql, params);
    return this.findById(accountData.id);
  }
}

module.exports = new AccountRepository();
