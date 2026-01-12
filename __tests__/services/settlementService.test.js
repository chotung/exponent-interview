const { v4: uuidv4 } = require('uuid');
const knex = require('../../src/db/knex');
const settlementService = require('../../src/services/settlementService');
const transactionService = require('../../src/services/transactionService');

describe('SettlementService', () => {
  let testUser, testAccount, testCard, pendingTransaction;

  beforeAll(async () => {
    await knex.migrate.latest();
  });

  beforeEach(async () => {
    // Clean database
    await knex('transactions').del();
    await knex('cards').del();
    await knex('accounts').del();
    await knex('users').del();

    // Create test data
    testUser = {
      id: uuidv4(),
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User'
    };
    await knex('users').insert(testUser);

    testAccount = {
      id: uuidv4(),
      user_id: testUser.id,
      account_number: '4111111111111111',
      credit_limit: 5000.00,
      current_balance: 0.00,
      status: 'active'
    };
    await knex('accounts').insert(testAccount);

    testCard = {
      id: `card_${uuidv4().substring(0, 8)}`,
      account_id: testAccount.id,
      card_number_last_four: '1111',
      card_hash: 'hash123',
      expiry_month: 12,
      expiry_year: 2026,
      status: 'active'
    };
    await knex('cards').insert(testCard);

    // Create pending transaction
    const authResult = await transactionService.authorizeTransaction({
      id: `txn_${uuidv4()}`,
      card_id: testCard.id,
      amount: 10000 // $100
    });
    pendingTransaction = authResult.transaction;
  });

  afterAll(async () => {
    await knex.destroy();
  });

  describe('settleTransaction', () => {
    test('should settle pending transaction successfully', async () => {
      const result = await settlementService.settleTransaction({
        transaction_id: pendingTransaction.id
      });

      expect(result.settled).toBe(true);
      expect(result.transaction.status).toBe('posted');

      // Verify in database
      const txn = await knex('transactions').where({ id: pendingTransaction.id }).first();
      expect(txn.status).toBe('posted');
      expect(txn.posted_at).not.toBeNull();
    });

    test('should reject settlement of non-existent transaction', async () => {
      const result = await settlementService.settleTransaction({
        transaction_id: 'fake_txn_123'
      });

      expect(result.settled).toBe(false);
      expect(result.reason).toBe('Transaction not found');
    });

    test('should reject settlement of already posted transaction', async () => {
      // Settle once
      await settlementService.settleTransaction({
        transaction_id: pendingTransaction.id
      });

      // Try to settle again
      const result = await settlementService.settleTransaction({
        transaction_id: pendingTransaction.id
      });

      expect(result.settled).toBe(false);
      expect(result.reason).toContain('already posted');
    });

    test('should handle authorization adjustment (lower final amount)', async () => {
      // Hotel pre-auth $100, actual charge $85
      const result = await settlementService.settleTransaction({
        transaction_id: pendingTransaction.id,
        final_amount: 85.00 // Lower than original $100
      });

      expect(result.settled).toBe(true);

      // Balance should be adjusted down
      const account = await knex('accounts').where({ id: testAccount.id }).first();
      expect(account.current_balance).toBe(85.00); // Not $100
    });

    test('should handle authorization adjustment (higher final amount)', async () => {
      // Gas station pre-auth $50, actual charge $60
      const authResult = await transactionService.authorizeTransaction({
        id: `txn_${uuidv4()}`,
        card_id: testCard.id,
        amount: 5000 // $50
      });

      const result = await settlementService.settleTransaction({
        transaction_id: authResult.transaction.id,
        final_amount: 60.00 // Higher than original $50
      });

      expect(result.settled).toBe(true);

      // Balance should increase by $10
      const account = await knex('accounts').where({ id: testAccount.id }).first();
      expect(account.current_balance).toBe(160.00); // $100 (from setup) + $60
    });

    test('should handle zero adjustment (same amount)', async () => {
      const result = await settlementService.settleTransaction({
        transaction_id: pendingTransaction.id,
        final_amount: 100.00 // Same as original
      });

      expect(result.settled).toBe(true);

      const account = await knex('accounts').where({ id: testAccount.id }).first();
      expect(account.current_balance).toBe(100.00);
    });

    test('should reject declined transaction settlement', async () => {
      // Create a declined transaction
      await knex('transactions').insert({
        id: `txn_${uuidv4()}`,
        card_id: testCard.id,
        account_id: testAccount.id,
        amount: 50.00,
        status: 'declined',
        previous_balance: 0,
        new_balance: 0,
        decline_reason: 'Insufficient funds'
      });

      const declinedTxn = await knex('transactions')
        .where({ status: 'declined' })
        .first();

      const result = await settlementService.settleTransaction({
        transaction_id: declinedTxn.id
      });

      expect(result.settled).toBe(false);
      expect(result.reason).toContain('already declined');
    });
  });

  describe('bulkSettleTransactions', () => {
    test('should settle multiple transactions', async () => {
      // Create multiple pending transactions
      const txn2 = await transactionService.authorizeTransaction({
        id: `txn_${uuidv4()}`,
        card_id: testCard.id,
        amount: 2000 // $20
      });

      const txn3 = await transactionService.authorizeTransaction({
        id: `txn_${uuidv4()}`,
        card_id: testCard.id,
        amount: 3000 // $30
      });

      const result = await settlementService.bulkSettleTransactions([
        { transaction_id: pendingTransaction.id },
        { transaction_id: txn2.transaction.id },
        { transaction_id: txn3.transaction.id }
      ]);

      expect(result.settled_count).toBe(3);
      expect(result.failed_count).toBe(0);
    });

    test('should handle partial failures in bulk settlement', async () => {
      const result = await settlementService.bulkSettleTransactions([
        { transaction_id: pendingTransaction.id }, // Valid
        { transaction_id: 'fake_txn_123' }, // Invalid
        { transaction_id: 'fake_txn_456' } // Invalid
      ]);

      expect(result.settled_count).toBe(1);
      expect(result.failed_count).toBe(2);
    });
  });
});
