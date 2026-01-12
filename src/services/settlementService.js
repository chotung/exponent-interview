const transactionRepository = require('../repositories/transactionRepository');
const accountRepository = require('../repositories/accountRepository');

/**
 * Settlement Service
 *
 * Handles transaction settlement (finalizing authorized transactions)
 * Typically occurs 1-3 days after authorization
 */

class SettlementService {
  /**
   * Settle a transaction (move from pending to posted)
   * @param {Object} settlementData - { transaction_id, final_amount? }
   * @returns {Promise<Object>} { settled: boolean, transaction?: Object }
   */
  async settleTransaction(settlementData) {
    try {
      const { transaction_id, final_amount } = settlementData;

      // 1. Find the transaction
      const transaction = await transactionRepository.findById(transaction_id);

      if (!transaction) {
        return {
          settled: false,
          reason: 'Transaction not found'
        };
      }

      // 2. Can only settle pending transactions
      if (transaction.status !== 'pending') {
        return {
          settled: false,
          reason: `Transaction already ${transaction.status}`
        };
      }

      // 3. Check if final_amount differs from authorized amount
      const hasAmountChange = final_amount && final_amount !== transaction.amount;

      if (hasAmountChange) {
        // Handle authorization adjustment (hotel, gas station scenarios)
        await this._handleAuthorizationAdjustment(transaction, final_amount);
      }

      // 4. Update transaction status to 'posted'
      const settledTransaction = await transactionRepository.updateStatus(
        transaction_id,
        'posted'
      );

      console.log(`✓ Transaction ${transaction_id} settled: ${hasAmountChange ? 'adjusted' : 'no change'}`);

      return {
        settled: true,
        transaction: settledTransaction
      };

    } catch (error) {
      console.error('Error settling transaction:', error);
      return {
        settled: false,
        reason: 'Internal server error'
      };
    }
  }

  /**
   * Private: Handle authorization adjustment
   * Example: Hotel pre-auth $100, final charge $85
   */
  async _handleAuthorizationAdjustment(transaction, finalAmount) {
    const difference = finalAmount - transaction.amount;
    const account = await accountRepository.findById(transaction.account_id);

    if (difference !== 0) {
      // Update account balance to reflect actual amount
      const newBalance = account.current_balance + difference;
      await accountRepository.updateBalance(account.id, newBalance);

      // Update transaction with final amount
      await transactionRepository.updateStatus(transaction.id, 'pending'); // Keep pending for now

      console.log(
        `⚠ Authorization adjustment: ${transaction.id} ` +
        `Original: $${transaction.amount.toFixed(2)}, ` +
        `Final: $${finalAmount.toFixed(2)}, ` +
        `Difference: $${difference.toFixed(2)}`
      );
    }
  }

  /**
   * Bulk settle transactions (for batch processing)
   * @param {Array} settlementDataArray
   * @returns {Promise<Object>} { settled_count, failed_count }
   */
  async bulkSettleTransactions(settlementDataArray) {
    let settled = 0;
    let failed = 0;

    for (const settlementData of settlementDataArray) {
      const result = await this.settleTransaction(settlementData);
      if (result.settled) {
        settled++;
      } else {
        failed++;
      }
    }

    return {
      settled_count: settled,
      failed_count: failed
    };
  }
}

module.exports = new SettlementService();
