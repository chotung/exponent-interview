const knex = require('../db/knex');

class AccountRepository {
  /**
   * Find account by ID with computed available credit
   * @param {string} accountId
   * @returns {Promise<Object|null>} Account object or null if not found
   */
  async findById(accountId) {
    return knex('accounts')
      .select(
        '*',
        knex.raw('(credit_limit - current_balance) as available_credit')
      )
      .where({ id: accountId })
      .first();
  }

  /**
   * Find all accounts for a user
   * @param {string} userId
   * @returns {Promise<Array>} Array of account objects
   */
  async findByUserId(userId) {
    return knex('accounts')
      .select(
        '*',
        knex.raw('(credit_limit - current_balance) as available_credit')
      )
      .where({ user_id: userId })
      .orderBy('created_at', 'desc');
  }

  /**
   * Update account balance
   * @param {string} accountId
   * @param {number} newBalance
   * @returns {Promise<Object>} Updated account
   */
  async updateBalance(accountId, newBalance) {
    await knex('accounts')
      .where({ id: accountId })
      .update({
        current_balance: newBalance,
        updated_at: knex.fn.now()
      });

    return this.findById(accountId);
  }

  /**
   * Update account balance within a transaction
   * Used by transaction service to ensure atomicity
   * @param {string} accountId
   * @param {number} amount - Amount to add (positive) or subtract (negative)
   * @returns {Promise<number>} New balance
   */
  async incrementBalance(accountId, amount) {
    await knex('accounts')
      .where({ id: accountId })
      .update({
        current_balance: knex.raw('current_balance + ?', [amount]),
        updated_at: knex.fn.now()
      });

    const account = await this.findById(accountId);
    return account.current_balance;
  }

  /**
   * Create a new account
   * @param {Object} accountData
   * @returns {Promise<Object>} Created account
   */
  async create(accountData) {
    await knex('accounts').insert({
      id: accountData.id,
      user_id: accountData.user_id,
      account_number: accountData.account_number,
      credit_limit: accountData.credit_limit || 0,
      current_balance: accountData.current_balance || 0,
      apr_rate: accountData.apr_rate || 19.99,
      statement_closing_day: accountData.statement_closing_day || 1,
      payment_due_day: accountData.payment_due_day || 21,
      status: accountData.status || 'active'
    });

    return this.findById(accountData.id);
  }
}

module.exports = new AccountRepository();
