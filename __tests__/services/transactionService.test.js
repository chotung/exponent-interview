const { v4: uuidv4 } = require('uuid');
const knex = require('../../src/db/knex');
const transactionService = require('../../src/services/transactionService');
const accountRepository = require('../../src/repositories/accountRepository');
const cardRepository = require('../../src/repositories/cardRepository');

describe('TransactionService', () => {
  let testUser, testAccount, testCard;

  beforeAll(async () => {
    // Run migrations
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
      statement_closing_day: 15,
      payment_due_day: 21,
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
  });

  afterAll(async () => {
    await knex.destroy();
  });

  describe('authorizeTransaction', () => {
    test('should approve valid transaction with sufficient credit', async () => {
      const webhookData = {
        id: `txn_${uuidv4()}`,
        card_id: testCard.id,
        amount: 2500, // $25.00 in cents
        currency: 'usd',
        merchant_data: {
          category: 5411,
          address: { city: 'New York' }
        }
      };

      const result = await transactionService.authorizeTransaction(webhookData);

      expect(result.approved).toBe(true);
      expect(result.transaction).toBeDefined();
      expect(result.transaction.status).toBe('pending');
      expect(result.transaction.amount).toBe(25.00);

      // Check balance was updated
      const account = await accountRepository.findById(testAccount.id);
      expect(account.current_balance).toBe(25.00);
    });

    test('should decline transaction with insufficient credit', async () => {
      const webhookData = {
        id: `txn_${uuidv4()}`,
        card_id: testCard.id,
        amount: 600000, // $6000.00 - exceeds $5000 limit
        currency: 'usd'
      };

      const result = await transactionService.authorizeTransaction(webhookData);

      expect(result.approved).toBe(false);
      expect(result.reason).toContain('Insufficient credit');
    });

    test('should decline transaction with inactive card', async () => {
      // Freeze the card
      await knex('cards').where({ id: testCard.id }).update({ status: 'frozen' });

      const webhookData = {
        id: `txn_${uuidv4()}`,
        card_id: testCard.id,
        amount: 1000
      };

      const result = await transactionService.authorizeTransaction(webhookData);

      expect(result.approved).toBe(false);
      expect(result.reason).toContain('frozen');
    });

    test('should decline transaction with non-existent card', async () => {
      const webhookData = {
        id: `txn_${uuidv4()}`,
        card_id: 'card_fake123',
        amount: 1000
      };

      const result = await transactionService.authorizeTransaction(webhookData);

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('Card not found');
    });

    test('should be idempotent - return same result for duplicate transaction', async () => {
      const webhookData = {
        id: `txn_${uuidv4()}`,
        card_id: testCard.id,
        amount: 1000
      };

      // First authorization
      const result1 = await transactionService.authorizeTransaction(webhookData);
      expect(result1.approved).toBe(true);

      // Second authorization with same transaction_id
      const result2 = await transactionService.authorizeTransaction(webhookData);
      expect(result2.approved).toBe(true);
      expect(result2.transaction.id).toBe(result1.transaction.id);

      // Balance should only be charged once
      const account = await accountRepository.findById(testAccount.id);
      expect(account.current_balance).toBe(10.00);
    });

    test('should track balance audit trail', async () => {
      const webhookData = {
        id: `txn_${uuidv4()}`,
        card_id: testCard.id,
        amount: 5000 // $50
      };

      const result = await transactionService.authorizeTransaction(webhookData);

      expect(result.transaction.previous_balance).toBe(0.00);
      expect(result.transaction.new_balance).toBe(50.00);
    });

    test('should handle multiple transactions correctly', async () => {
      // Transaction 1: $25
      await transactionService.authorizeTransaction({
        id: `txn_${uuidv4()}`,
        card_id: testCard.id,
        amount: 2500
      });

      // Transaction 2: $30
      const result2 = await transactionService.authorizeTransaction({
        id: `txn_${uuidv4()}`,
        card_id: testCard.id,
        amount: 3000
      });

      expect(result2.approved).toBe(true);
      expect(result2.transaction.previous_balance).toBe(25.00);
      expect(result2.transaction.new_balance).toBe(55.00);

      // Check final balance
      const account = await accountRepository.findById(testAccount.id);
      expect(account.current_balance).toBe(55.00);
    });

    test('should decline when exceeding card spending limit', async () => {
      // Set card spending limit
      await knex('cards').where({ id: testCard.id }).update({ spending_limit: 100.00 });

      const webhookData = {
        id: `txn_${uuidv4()}`,
        card_id: testCard.id,
        amount: 15000 // $150 - exceeds card limit
      };

      const result = await transactionService.authorizeTransaction(webhookData);

      expect(result.approved).toBe(false);
      expect(result.reason).toContain('spending limit');
    });
  });

  describe('processPayment', () => {
    test('should process payment and reduce balance', async () => {
      // Set up account with balance
      await knex('accounts')
        .where({ id: testAccount.id })
        .update({ current_balance: 100.00 });

      const result = await transactionService.processPayment(testAccount.id, 50.00);

      expect(result.transaction_type).toBe('payment');
      expect(result.amount).toBe(-50.00);
      expect(result.new_balance).toBe(50.00);

      // Check account balance
      const account = await accountRepository.findById(testAccount.id);
      expect(account.current_balance).toBe(50.00);
    });

    test('should not allow negative balance from payment', async () => {
      // Account has $50 balance
      await knex('accounts')
        .where({ id: testAccount.id })
        .update({ current_balance: 50.00 });

      // Pay $100 (more than owed)
      const result = await transactionService.processPayment(testAccount.id, 100.00);

      // Balance should be 0, not -50
      expect(result.new_balance).toBe(0.00);
    });

    test('should throw error for non-existent account', async () => {
      await expect(
        transactionService.processPayment('fake_account_id', 50.00)
      ).rejects.toThrow('Account not found');
    });
  });
});
