const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const knex = require('../../src/db/knex');

// Import app without starting the server
const express = require('express');
const app = express();
app.use(express.json());
app.use('/webhooks', require('../../src/routes/webhooks'));
app.use('/payments', require('../../src/routes/payments'));
app.use('/statements', require('../../src/routes/statements'));

describe('Webhook Integration Tests', () => {
  let testUser, testAccount, testCard;

  beforeAll(async () => {
    await knex.migrate.latest();
  });

  beforeEach(async () => {
    // Clean database
    await knex('statements').del();
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

  describe('POST /webhooks/transactions', () => {
    test('should approve valid transaction with 200 status', async () => {
      const response = await request(app)
        .post('/webhooks/transactions')
        .send({
          id: `txn_${uuidv4()}`,
          card_id: testCard.id,
          amount: 5000, // $50.00
          currency: 'usd',
          merchant_data: {
            name: 'Test Merchant',
            category: 5411
          }
        })
        .expect(200);

      expect(response.body.approved).toBe(true);
      expect(response.body.transaction).toBeDefined();
      expect(response.body.transaction.amount).toBe(50.00);
      expect(response.body.transaction.status).toBe('pending');
    });

    test('should decline transaction exceeding credit limit', async () => {
      const response = await request(app)
        .post('/webhooks/transactions')
        .send({
          id: `txn_${uuidv4()}`,
          card_id: testCard.id,
          amount: 600000, // $6000 - exceeds $5000 limit
          currency: 'usd'
        })
        .expect(200);

      expect(response.body.approved).toBe(false);
      expect(response.body.reason).toContain('Insufficient credit');
    });

    test('should decline transaction with invalid card', async () => {
      const response = await request(app)
        .post('/webhooks/transactions')
        .send({
          id: `txn_${uuidv4()}`,
          card_id: 'card_invalid',
          amount: 1000,
          currency: 'usd'
        })
        .expect(200);

      expect(response.body.approved).toBe(false);
      expect(response.body.reason).toBe('Card not found');
    });

    test('should be idempotent for duplicate transaction IDs', async () => {
      const transactionId = `txn_${uuidv4()}`;
      const payload = {
        id: transactionId,
        card_id: testCard.id,
        amount: 2500,
        currency: 'usd'
      };

      // First request
      const response1 = await request(app)
        .post('/webhooks/transactions')
        .send(payload)
        .expect(200);

      expect(response1.body.approved).toBe(true);

      // Second request with same ID
      const response2 = await request(app)
        .post('/webhooks/transactions')
        .send(payload)
        .expect(200);

      expect(response2.body.approved).toBe(true);
      expect(response2.body.transaction.id).toBe(response1.body.transaction.id);

      // Verify balance was only charged once
      const account = await knex('accounts').where({ id: testAccount.id }).first();
      expect(account.current_balance).toBe(25.00);
    });

    test('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/webhooks/transactions')
        .send({
          // Missing card_id and amount
          id: `txn_${uuidv4()}`,
          currency: 'usd'
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    test('should decline frozen card', async () => {
      // Freeze the card
      await knex('cards').where({ id: testCard.id }).update({ status: 'frozen' });

      const response = await request(app)
        .post('/webhooks/transactions')
        .send({
          id: `txn_${uuidv4()}`,
          card_id: testCard.id,
          amount: 1000,
          currency: 'usd'
        })
        .expect(200);

      expect(response.body.approved).toBe(false);
      expect(response.body.reason).toContain('frozen');
    });

    test('should handle multiple sequential transactions correctly', async () => {
      // Transaction 1: $25
      await request(app)
        .post('/webhooks/transactions')
        .send({
          id: `txn_${uuidv4()}`,
          card_id: testCard.id,
          amount: 2500
        })
        .expect(200);

      // Transaction 2: $30
      const response2 = await request(app)
        .post('/webhooks/transactions')
        .send({
          id: `txn_${uuidv4()}`,
          card_id: testCard.id,
          amount: 3000
        })
        .expect(200);

      expect(response2.body.approved).toBe(true);

      // Verify final balance
      const account = await knex('accounts').where({ id: testAccount.id }).first();
      expect(account.current_balance).toBe(55.00);
    });
  });

  describe('POST /webhooks/settlements', () => {
    let pendingTransaction;

    beforeEach(async () => {
      // Create a pending transaction to settle
      const response = await request(app)
        .post('/webhooks/transactions')
        .send({
          id: `txn_${uuidv4()}`,
          card_id: testCard.id,
          amount: 10000 // $100
        });

      pendingTransaction = response.body.transaction;
    });

    test('should settle pending transaction successfully', async () => {
      const response = await request(app)
        .post('/webhooks/settlements')
        .send({
          transaction_id: pendingTransaction.id
        })
        .expect(200);

      expect(response.body.settled).toBe(true);
      expect(response.body.transaction.status).toBe('posted');

      // Verify in database
      const txn = await knex('transactions')
        .where({ id: pendingTransaction.id })
        .first();
      expect(txn.status).toBe('posted');
      expect(txn.posted_at).not.toBeNull();
    });

    test('should handle authorization adjustment (lower amount)', async () => {
      // Hotel pre-auth $100, actual charge $85
      const response = await request(app)
        .post('/webhooks/settlements')
        .send({
          transaction_id: pendingTransaction.id,
          final_amount: 85.00
        })
        .expect(200);

      expect(response.body.settled).toBe(true);

      // Verify balance was adjusted down
      const account = await knex('accounts').where({ id: testAccount.id }).first();
      expect(account.current_balance).toBe(85.00);
    });

    test('should handle authorization adjustment (higher amount)', async () => {
      // Gas station pre-auth $100, actual charge $120
      const response = await request(app)
        .post('/webhooks/settlements')
        .send({
          transaction_id: pendingTransaction.id,
          final_amount: 120.00
        })
        .expect(200);

      expect(response.body.settled).toBe(true);

      // Verify balance increased
      const account = await knex('accounts').where({ id: testAccount.id }).first();
      expect(account.current_balance).toBe(120.00);
    });

    test('should reject settlement of non-existent transaction', async () => {
      const response = await request(app)
        .post('/webhooks/settlements')
        .send({
          transaction_id: 'fake_txn_123'
        })
        .expect(200);

      expect(response.body.settled).toBe(false);
      expect(response.body.reason).toBe('Transaction not found');
    });

    test('should reject settlement of already posted transaction', async () => {
      // Settle once
      await request(app)
        .post('/webhooks/settlements')
        .send({
          transaction_id: pendingTransaction.id
        })
        .expect(200);

      // Try to settle again
      const response = await request(app)
        .post('/webhooks/settlements')
        .send({
          transaction_id: pendingTransaction.id
        })
        .expect(200);

      expect(response.body.settled).toBe(false);
      expect(response.body.reason).toContain('already posted');
    });

    test('should return 400 for missing transaction_id', async () => {
      const response = await request(app)
        .post('/webhooks/settlements')
        .send({
          // Missing transaction_id
          final_amount: 50.00
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('POST /payments', () => {
    beforeEach(async () => {
      // Set up account with a balance
      await knex('accounts')
        .where({ id: testAccount.id })
        .update({ current_balance: 100.00 });
    });

    test('should process payment successfully', async () => {
      const response = await request(app)
        .post('/payments')
        .send({
          account_id: testAccount.id,
          amount: 50.00
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.new_balance).toBe(50.00);

      // Verify in database
      const account = await knex('accounts').where({ id: testAccount.id }).first();
      expect(account.current_balance).toBe(50.00);
    });

    test('should not allow negative balance from overpayment', async () => {
      const response = await request(app)
        .post('/payments')
        .send({
          account_id: testAccount.id,
          amount: 150.00 // More than the $100 balance
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.new_balance).toBe(0.00);
    });

    test('should return 404 for non-existent account', async () => {
      const response = await request(app)
        .post('/payments')
        .send({
          account_id: 'fake_account_id',
          amount: 50.00
        })
        .expect(404);

      expect(response.body.error).toContain('Account not found');
    });

    test('should return 400 for missing fields', async () => {
      const response = await request(app)
        .post('/payments')
        .send({
          // Missing amount
          account_id: testAccount.id
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    test('should return 400 for invalid amount', async () => {
      const response = await request(app)
        .post('/payments')
        .send({
          account_id: testAccount.id,
          amount: -50.00 // Negative amount
        })
        .expect(400);

      expect(response.body.error).toContain('amount');
    });
  });

  describe('POST /statements/generate', () => {
    beforeEach(async () => {
      // Set account closing day to today
      await knex('accounts')
        .where({ id: testAccount.id })
        .update({
          statement_closing_day: new Date().getDate(),
          current_balance: 150.00
        });

      // Create some posted transactions
      await knex('transactions').insert([
        {
          id: uuidv4(),
          card_id: testCard.id,
          account_id: testAccount.id,
          amount: 75.00,
          transaction_type: 'purchase',
          status: 'posted',
          previous_balance: 0,
          new_balance: 75.00,
          posted_at: new Date()
        },
        {
          id: uuidv4(),
          card_id: testCard.id,
          account_id: testAccount.id,
          amount: 75.00,
          transaction_type: 'purchase',
          status: 'posted',
          previous_balance: 75.00,
          new_balance: 150.00,
          posted_at: new Date()
        }
      ]);
    });

    test('should generate statements for eligible accounts', async () => {
      const response = await request(app)
        .post('/statements/generate')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.generated_count).toBe(1);

      // Verify statement was created
      const statement = await knex('statements')
        .where({ account_id: testAccount.id })
        .first();
      expect(statement).toBeDefined();
      expect(statement.total_purchases).toBe(150.00);
      expect(statement.closing_balance).toBe(150.00);
    });

    test('should not generate duplicate statements', async () => {
      // Generate first time
      await request(app)
        .post('/statements/generate')
        .expect(200);

      // Try to generate again
      const response = await request(app)
        .post('/statements/generate')
        .expect(200);

      expect(response.body.generated_count).toBe(0);

      // Verify only one statement exists
      const statements = await knex('statements')
        .where({ account_id: testAccount.id });
      expect(statements.length).toBe(1);
    });

    test('should skip accounts with different closing day', async () => {
      // Change closing day to tomorrow
      await knex('accounts')
        .where({ id: testAccount.id })
        .update({
          statement_closing_day: (new Date().getDate() + 1) % 28 || 1
        });

      const response = await request(app)
        .post('/statements/generate')
        .expect(200);

      expect(response.body.generated_count).toBe(0);
    });
  });

  describe('GET /statements/account/:accountId', () => {
    beforeEach(async () => {
      // Create multiple statements
      for (let i = 0; i < 3; i++) {
        await knex('statements').insert({
          id: uuidv4(),
          account_id: testAccount.id,
          statement_date: new Date(2024, i, 15),
          closing_balance: 100.00 + (i * 10),
          previous_balance: 50.00,
          minimum_payment_due: 25.00,
          payment_due_date: new Date(2024, i + 1, 5),
          status: 'generated'
        });
      }
    });

    test('should retrieve statements for account', async () => {
      const response = await request(app)
        .get(`/statements/account/${testAccount.id}`)
        .expect(200);

      expect(response.body.length).toBe(3);
      // Should be in descending order (newest first)
      expect(new Date(response.body[0].statement_date).getTime())
        .toBeGreaterThanOrEqual(new Date(response.body[1].statement_date).getTime());
    });

    test('should limit number of statements returned', async () => {
      const response = await request(app)
        .get(`/statements/account/${testAccount.id}?limit=2`)
        .expect(200);

      expect(response.body.length).toBe(2);
    });

    test('should return empty array for account with no statements', async () => {
      const newAccount = {
        id: uuidv4(),
        user_id: testUser.id,
        account_number: '5111111111111111',
        credit_limit: 3000.00,
        current_balance: 0.00,
        status: 'active'
      };
      await knex('accounts').insert(newAccount);

      const response = await request(app)
        .get(`/statements/account/${newAccount.id}`)
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });
});
