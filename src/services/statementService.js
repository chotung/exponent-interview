const knex = require('../db/knex');
const { v4: uuidv4 } = require('uuid');

/**
 * Statement Service
 *
 * Handles monthly statement generation and billing cycle processing
 * Should be run as a scheduled job (cron) daily
 */

class StatementService {
  /**
   * Generate monthly statements for all eligible accounts
   * Run this daily - it will only generate statements on the correct closing day
   *
   * @returns {Promise<Object>} { generated_count, skipped_count }
   */
  async generateMonthlyStatements() {
    try {
      const today = new Date().getDate(); // Day of month (1-31)

      // Find all active accounts with statement_closing_day = today
      const eligibleAccounts = await knex('accounts')
        .where('statement_closing_day', today)
        .where('status', 'active');

      console.log(`Found ${eligibleAccounts.length} accounts eligible for statement generation`);

      let generated = 0;
      let skipped = 0;

      for (const account of eligibleAccounts) {
        const result = await this.generateStatementForAccount(account.id);
        if (result.generated) {
          generated++;
        } else {
          skipped++;
        }
      }

      console.log(`✓ Statement generation complete: ${generated} generated, ${skipped} skipped`);

      return {
        generated_count: generated,
        skipped_count: skipped
      };

    } catch (error) {
      console.error('Error generating monthly statements:', error);
      throw error;
    }
  }

  /**
   * Generate a statement for a specific account
   *
   * @param {string} accountId
   * @returns {Promise<Object>} { generated: boolean, statement?: Object }
   */
  async generateStatementForAccount(accountId) {
    try {
      const account = await knex('accounts').where({ id: accountId }).first();

      if (!account) {
        return { generated: false, reason: 'Account not found' };
      }

      // Check if statement already exists for this period
      const existingStatement = await knex('statements')
        .where('account_id', accountId)
        .where('statement_date', '>=', this._getFirstDayOfMonth())
        .first();

      if (existingStatement) {
        console.log(`Statement already exists for account ${accountId} this month`);
        return { generated: false, reason: 'Statement already exists' };
      }

      // Get all posted transactions since last statement
      const lastStatement = await this._getLastStatement(accountId);
      const sinceDate = lastStatement
        ? new Date(lastStatement.statement_date)
        : new Date(0); // Beginning of time if no previous statement

      const transactions = await knex('transactions')
        .where('account_id', accountId)
        .where('status', 'posted')
        .where('created_at', '>', sinceDate)
        .orderBy('created_at', 'asc');

      // Calculate totals
      const totals = this._calculateTotals(transactions);

      // Calculate minimum payment (higher of $25 or 2% of balance)
      const minimumPayment = Math.max(25, account.current_balance * 0.02);

      // Calculate payment due date (statement_closing_day + payment_due_day)
      const paymentDueDate = this._calculatePaymentDueDate(
        account.statement_closing_day,
        account.payment_due_day
      );

      // Create statement
      const statementId = uuidv4();
      await knex('statements').insert({
        id: statementId,
        account_id: accountId,
        statement_date: new Date(),
        closing_balance: account.current_balance,
        previous_balance: lastStatement ? lastStatement.closing_balance : 0,
        total_purchases: totals.purchases,
        total_payments: totals.payments,
        total_fees: totals.fees,
        total_interest: totals.interest,
        minimum_payment_due: minimumPayment,
        payment_due_date: paymentDueDate,
        status: 'generated'
      });

      // Link transactions to this statement
      if (transactions.length > 0) {
        await knex('transactions')
          .whereIn('id', transactions.map(t => t.id))
          .update({ statement_id: statementId });
      }

      const statement = await knex('statements').where({ id: statementId }).first();

      console.log(
        `✓ Statement generated for account ${accountId}: ` +
        `Balance: $${account.current_balance.toFixed(2)}, ` +
        `Min Payment: $${minimumPayment.toFixed(2)}, ` +
        `Transactions: ${transactions.length}`
      );

      return {
        generated: true,
        statement
      };

    } catch (error) {
      console.error(`Error generating statement for account ${accountId}:`, error);
      return { generated: false, reason: error.message };
    }
  }

  /**
   * Private: Calculate totals from transactions
   */
  _calculateTotals(transactions) {
    const totals = {
      purchases: 0,
      payments: 0,
      fees: 0,
      interest: 0
    };

    for (const transaction of transactions) {
      switch (transaction.transaction_type) {
        case 'purchase':
          totals.purchases += transaction.amount;
          break;
        case 'payment':
          totals.payments += Math.abs(transaction.amount);
          break;
        case 'fee':
          totals.fees += transaction.amount;
          break;
        case 'interest':
          totals.interest += transaction.amount;
          break;
      }
    }

    return totals;
  }

  /**
   * Private: Get last statement for account
   */
  async _getLastStatement(accountId) {
    return knex('statements')
      .where('account_id', accountId)
      .orderBy('statement_date', 'desc')
      .first();
  }

  /**
   * Private: Get first day of current month
   */
  _getFirstDayOfMonth() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  /**
   * Private: Calculate payment due date
   * Example: closing_day=15, payment_due_day=21 → due 21 days after closing
   */
  _calculatePaymentDueDate(closingDay, paymentDueDays) {
    const now = new Date();
    const closingDate = new Date(now.getFullYear(), now.getMonth(), closingDay);
    const dueDate = new Date(closingDate);
    dueDate.setDate(dueDate.getDate() + paymentDueDays);
    return dueDate;
  }

  /**
   * Get statement by ID
   */
  async getStatement(statementId) {
    return knex('statements').where({ id: statementId }).first();
  }

  /**
   * Get all statements for an account
   */
  async getStatementsForAccount(accountId, limit = 12) {
    return knex('statements')
      .where({ account_id: accountId })
      .orderBy('statement_date', 'desc')
      .limit(limit);
  }
}

module.exports = new StatementService();
