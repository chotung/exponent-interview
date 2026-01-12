const knex = require('../db/knex');

class TransactionRepository {
  /**
   * Find transaction by ID with merchant information
   * @param {string} transactionId
   * @returns {Promise<Object|null>} Transaction object or null if not found
   */
  async findById(transactionId) {
    return knex('transactions as t')
      .select('t.*', 'm.name as merchant_name_full')
      .leftJoin('merchants as m', 't.merchant_id', 'm.id')
      .where('t.id', transactionId)
      .first();
  }

  /**
   * Find all transactions for an account
   * @param {string} accountId
   * @param {number} limit
   * @returns {Promise<Array>} Array of transaction objects
   */
  async findByAccountId(accountId, limit = 100) {
    return knex('transactions')
      .where({ account_id: accountId })
      .orderBy('created_at', 'desc')
      .limit(limit);
  }

  /**
   * Create a new transaction
   * @param {Object} transactionData
   * @returns {Promise<Object>} Created transaction
   */
  async create(transactionData) {
    await knex('transactions').insert({
      id: transactionData.id,
      card_id: transactionData.card_id,
      account_id: transactionData.account_id,
      merchant_id: transactionData.merchant_id || null,
      amount: transactionData.amount,
      currency: transactionData.currency || 'usd',
      transaction_type: transactionData.transaction_type || 'purchase',
      status: transactionData.status || 'pending',
      previous_balance: transactionData.previous_balance,
      new_balance: transactionData.new_balance,
      authorization_code: transactionData.authorization_code || null,
      decline_reason: transactionData.decline_reason || null,
      merchant_category_code: transactionData.merchant_category_code || null,
      merchant_name: transactionData.merchant_name || null,
      merchant_address: transactionData.merchant_address
        ? JSON.stringify(transactionData.merchant_address)
        : null
    });

    return this.findById(transactionData.id);
  }

  /**
   * Update transaction status
   * @param {string} transactionId
   * @param {string} status - pending, posted, declined, reversed
   * @returns {Promise<Object>} Updated transaction
   */
  async updateStatus(transactionId, status) {
    const updateData = {
      status: status,
      updated_at: knex.fn.now()
    };

    // Set posted_at timestamp if status is 'posted'
    if (status === 'posted') {
      updateData.posted_at = knex.fn.now();
    }

    await knex('transactions')
      .where({ id: transactionId })
      .update(updateData);

    return this.findById(transactionId);
  }

  /**
   * Get total spending by merchant category
   * @param {string} accountId
   * @param {number} days - Number of days to look back
   * @returns {Promise<Array>} Array of {merchant_category_code, total}
   */
  async getSpendingByCategory(accountId, days = 30) {
    // Use raw SQL for date functions (different in SQLite vs PostgreSQL)
    // SQLite: datetime('now', '-30 days')
    // PostgreSQL: NOW() - INTERVAL '30 days'
    const databaseType = process.env.DATABASE_TYPE || 'sqlite';

    if (databaseType === 'sqlite') {
      return knex('transactions')
        .select('merchant_category_code')
        .sum('amount as total')
        .where({ account_id: accountId, status: 'posted', transaction_type: 'purchase' })
        .whereRaw(`created_at >= datetime('now', '-' || ? || ' days')`, [days])
        .groupBy('merchant_category_code')
        .orderBy('total', 'desc');
    } else {
      // PostgreSQL version
      return knex('transactions')
        .select('merchant_category_code')
        .sum('amount as total')
        .where({ account_id: accountId, status: 'posted', transaction_type: 'purchase' })
        .whereRaw(`created_at >= NOW() - INTERVAL '${days} days'`)
        .groupBy('merchant_category_code')
        .orderBy('total', 'desc');
    }
  }

  /**
   * Check if transaction ID already exists (prevent duplicates)
   * @param {string} transactionId
   * @returns {Promise<boolean>}
   */
  async exists(transactionId) {
    const result = await knex('transactions')
      .where({ id: transactionId })
      .count('* as count')
      .first();

    return result.count > 0;
  }
}

module.exports = new TransactionRepository();
