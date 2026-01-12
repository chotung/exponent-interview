const cardRepository = require('../repositories/cardRepository');
const accountRepository = require('../repositories/accountRepository');
const transactionRepository = require('../repositories/transactionRepository');
const { v4: uuidv4 } = require('uuid');

/**
 * Transaction Service - Updated for Knex (async/await)
 *
 * Contains business logic for transaction authorization
 * Implements the authorization flow from the README
 *
 * All repository calls are now async, so we use async/await
 */

class TransactionService {
  /**
   * Authorize a transaction from webhook
   * @param {Object} webhookData - { id, card_id, amount, currency, merchant_data }
   * @returns {Promise<Object>} { approved: boolean, reason?: string, transaction?: Object }
   */
  async authorizeTransaction(webhookData) {
    try {
      const { id, card_id, amount, currency, merchant_data } = webhookData;

      // 1. Check for duplicate transaction (idempotency)
      const isDuplicate = await transactionRepository.exists(id);
      if (isDuplicate) {
        console.log(`Transaction ${id} already exists. Returning previous result.`);
        const existingTxn = await transactionRepository.findById(id);
        return {
          approved: existingTxn.status === 'pending' || existingTxn.status === 'posted',
          transaction: existingTxn
        };
      }

      // 2. Validate card exists and is active
      const card = await cardRepository.findById(card_id);
      if (!card) {
        return this._declineTransaction(webhookData, null, 'Card not found');
      }

      if (card.status !== 'active') {
        return this._declineTransaction(webhookData, card, `Card status is ${card.status}`);
      }

      // 3. Check account status
      const account = await accountRepository.findById(card.account_id);
      if (!account || account.account_status !== 'active') {
        return this._declineTransaction(webhookData, card, 'Account not active');
      }

      // 4. Check available credit
      const availableCredit = account.credit_limit - account.current_balance;
      if (availableCredit < amount / 100) { // amount is in cents
        return this._declineTransaction(
          webhookData,
          card,
          `Insufficient credit. Available: $${availableCredit.toFixed(2)}, Requested: $${(amount / 100).toFixed(2)}`
        );
      }

      // 5. Check card-specific spending limit (if set)
      if (card.spending_limit && amount / 100 > card.spending_limit) {
        return this._declineTransaction(
          webhookData,
          card,
          `Exceeds card spending limit of $${card.spending_limit.toFixed(2)}`
        );
      }

      // 6. Approve transaction - update balance and create transaction record
      const amountInDollars = amount / 100;
      const previousBalance = account.current_balance;
      const newBalance = previousBalance + amountInDollars;

      // Create transaction record
      const transaction = await transactionRepository.create({
        id,
        card_id,
        account_id: account.id,
        amount: amountInDollars,
        currency: currency || 'usd',
        transaction_type: 'purchase',
        status: 'pending',
        previous_balance: previousBalance,
        new_balance: newBalance,
        merchant_category_code: merchant_data?.category,
        merchant_name: null, // Can be enriched later
        merchant_address: merchant_data?.address,
        authorization_code: this._generateAuthCode()
      });

      // Update account balance
      await accountRepository.updateBalance(account.id, newBalance);

      console.log(`✓ Transaction ${id} approved: $${amountInDollars.toFixed(2)} - New balance: $${newBalance.toFixed(2)}`);

      return {
        approved: true,
        transaction
      };

    } catch (error) {
      console.error('Error authorizing transaction:', error);
      return {
        approved: false,
        reason: 'Internal server error'
      };
    }
  }

  /**
   * Private: Decline a transaction and record it
   */
  async _declineTransaction(webhookData, card, reason) {
    console.log(`✗ Transaction ${webhookData.id} declined: ${reason}`);

    // Still create a transaction record for audit trail
    if (card) {
      const account = await accountRepository.findById(card.account_id);
      await transactionRepository.create({
        id: webhookData.id,
        card_id: webhookData.card_id,
        account_id: account.id,
        amount: webhookData.amount / 100,
        currency: webhookData.currency || 'usd',
        transaction_type: 'purchase',
        status: 'declined',
        previous_balance: account.current_balance,
        new_balance: account.current_balance,
        decline_reason: reason,
        merchant_category_code: webhookData.merchant_data?.category,
        merchant_address: webhookData.merchant_data?.address
      });
    }

    return {
      approved: false,
      reason
    };
  }

  /**
   * Generate authorization code (6 digit alphanumeric)
   */
  _generateAuthCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  /**
   * Process a payment transaction
   * @param {string} accountId
   * @param {number} amount
   * @returns {Promise<Object>} Created transaction
   */
  async processPayment(accountId, amount) {
    const account = await accountRepository.findById(accountId);
    if (!account) {
      throw new Error('Account not found');
    }

    const previousBalance = account.current_balance;
    const newBalance = Math.max(0, previousBalance - amount);

    const transaction = await transactionRepository.create({
      id: `payment_${uuidv4()}`,
      card_id: null, // Payments aren't tied to a specific card
      account_id: accountId,
      amount: -amount, // Negative for payment
      currency: 'usd',
      transaction_type: 'payment',
      status: 'posted',
      previous_balance: previousBalance,
      new_balance: newBalance
    });

    await accountRepository.updateBalance(accountId, newBalance);

    return transaction;
  }
}

module.exports = new TransactionService();
