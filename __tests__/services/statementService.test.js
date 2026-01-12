const { v4: uuidv4 } = require('uuid');
const knex = require('../../src/db/knex');
const statementService = require('../../src/services/statementService');
const transactionService = require('../../src/services/transactionService');

describe('StatementService', () => {
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
      current_balance: 150.00,
      statement_closing_day: new Date().getDate(), // Today
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

  describe('generateStatementForAccount', () => {
    test('should generate statement with correct totals', async () => {
      // Create posted transactions
      await knex('transactions').insert([
        {
          id: uuidv4(),
          card_id: testCard.id,
          account_id: testAccount.id,
          amount: 50.00,
          transaction_type: 'purchase',
          status: 'posted',
          previous_balance: 0,
          new_balance: 50.00
        },
        {
          id: uuidv4(),
          card_id: testCard.id,
          account_id: testAccount.id,
          amount: 75.00,
          transaction_type: 'purchase',
          status: 'posted',
          previous_balance: 50.00,
          new_balance: 125.00
        },
        {
          id: uuidv4(),
          card_id: testCard.id,
          account_id: testAccount.id,
          amount: -25.00,
          transaction_type: 'payment',
          status: 'posted',
          previous_balance: 125.00,
          new_balance: 100.00
        }
      ]);

      const result = await statementService.generateStatementForAccount(testAccount.id);

      expect(result.generated).toBe(true);
      expect(result.statement).toBeDefined();
      expect(result.statement.total_purchases).toBe(125.00); // $50 + $75
      expect(result.statement.total_payments).toBe(25.00);
      expect(result.statement.closing_balance).toBe(150.00);
    });

    test('should calculate minimum payment correctly (2% or $25)', async () => {
      // Test 1: Balance of $1000 → min payment = $25 (2% of $1000 = $20, but min is $25)
      await knex('accounts')
        .where({ id: testAccount.id })
        .update({ current_balance: 1000.00 });

      const result1 = await statementService.generateStatementForAccount(testAccount.id);
      expect(result1.statement.minimum_payment_due).toBe(25.00);

      // Test 2: Balance of $2000 → min payment = $40 (2% of $2000 = $40)
      await knex('statements').del(); // Clean up
      await knex('accounts')
        .where({ id: testAccount.id })
        .update({ current_balance: 2000.00 });

      const result2 = await statementService.generateStatementForAccount(testAccount.id);
      expect(result2.statement.minimum_payment_due).toBe(40.00);
    });

    test('should not generate duplicate statement for same period', async () => {
      // Generate first statement
      const result1 = await statementService.generateStatementForAccount(testAccount.id);
      expect(result1.generated).toBe(true);

      // Try to generate again
      const result2 = await statementService.generateStatementForAccount(testAccount.id);
      expect(result2.generated).toBe(false);
      expect(result2.reason).toBe('Statement already exists');
    });

    test('should link transactions to statement', async () => {
      // Create transactions
      const txn1 = await knex('transactions').insert({
        id: uuidv4(),
        card_id: testCard.id,
        account_id: testAccount.id,
        amount: 50.00,
        transaction_type: 'purchase',
        status: 'posted',
        previous_balance: 0,
        new_balance: 50.00
      }).returning('id');

      // Generate statement
      const result = await statementService.generateStatementForAccount(testAccount.id);

      // Check transaction is linked
      const txn = await knex('transactions').where({ id: txn1[0].id || txn1[0] }).first();
      expect(txn.statement_id).toBe(result.statement.id);
    });

    test('should only include posted transactions', async () => {
      // Create pending and posted transactions
      await knex('transactions').insert([
        {
          id: uuidv4(),
          card_id: testCard.id,
          account_id: testAccount.id,
          amount: 50.00,
          transaction_type: 'purchase',
          status: 'pending', // Not posted
          previous_balance: 0,
          new_balance: 50.00
        },
        {
          id: uuidv4(),
          card_id: testCard.id,
          account_id: testAccount.id,
          amount: 75.00,
          transaction_type: 'purchase',
          status: 'posted', // Posted
          previous_balance: 50.00,
          new_balance: 125.00
        }
      ]);

      const result = await statementService.generateStatementForAccount(testAccount.id);

      // Should only count posted transaction
      expect(result.statement.total_purchases).toBe(75.00); // Not $125
    });

    test('should calculate payment due date correctly', async () => {
      const result = await statementService.generateStatementForAccount(testAccount.id);

      const dueDate = new Date(result.statement.payment_due_date);
      const statementDate = new Date(result.statement.statement_date);

      // Due date should be 21 days after statement date (payment_due_day = 21)
      const daysDiff = Math.floor((dueDate - statementDate) / (1000 * 60 * 60 * 24));
      expect(daysDiff).toBe(21);
    });

    test('should handle account with no transactions', async () => {
      const result = await statementService.generateStatementForAccount(testAccount.id);

      expect(result.generated).toBe(true);
      expect(result.statement.total_purchases).toBe(0);
      expect(result.statement.total_payments).toBe(0);
      expect(result.statement.total_fees).toBe(0);
      expect(result.statement.total_interest).toBe(0);
    });

    test('should calculate fees and interest separately', async () => {
      await knex('transactions').insert([
        {
          id: uuidv4(),
          card_id: testCard.id,
          account_id: testAccount.id,
          amount: 10.00,
          transaction_type: 'fee',
          status: 'posted',
          previous_balance: 0,
          new_balance: 10.00
        },
        {
          id: uuidv4(),
          card_id: testCard.id,
          account_id: testAccount.id,
          amount: 15.50,
          transaction_type: 'interest',
          status: 'posted',
          previous_balance: 10.00,
          new_balance: 25.50
        }
      ]);

      const result = await statementService.generateStatementForAccount(testAccount.id);

      expect(result.statement.total_fees).toBe(10.00);
      expect(result.statement.total_interest).toBe(15.50);
    });
  });

  describe('generateMonthlyStatements', () => {
    test('should only generate for accounts with matching closing day', async () => {
      // Create another account with different closing day
      const otherAccount = {
        id: uuidv4(),
        user_id: testUser.id,
        account_number: '5111111111111111',
        credit_limit: 3000.00,
        current_balance: 100.00,
        statement_closing_day: (new Date().getDate() + 1) % 28 || 1, // Different day
        payment_due_day: 21,
        status: 'active'
      };
      await knex('accounts').insert(otherAccount);

      const result = await statementService.generateMonthlyStatements();

      // Should only generate for testAccount (today's closing day)
      expect(result.generated_count).toBe(1);

      // Verify only one statement was created
      const statements = await knex('statements').select('*');
      expect(statements.length).toBe(1);
      expect(statements[0].account_id).toBe(testAccount.id);
    });

    test('should handle multiple eligible accounts', async () => {
      // Create multiple accounts with same closing day
      for (let i = 0; i < 3; i++) {
        await knex('accounts').insert({
          id: uuidv4(),
          user_id: testUser.id,
          account_number: `611111111111111${i}`,
          credit_limit: 5000.00,
          current_balance: 100.00,
          statement_closing_day: new Date().getDate(),
          payment_due_day: 21,
          status: 'active'
        });
      }

      const result = await statementService.generateMonthlyStatements();

      expect(result.generated_count).toBe(4); // 3 new + 1 existing
    });

    test('should skip suspended accounts', async () => {
      await knex('accounts')
        .where({ id: testAccount.id })
        .update({ status: 'suspended' });

      const result = await statementService.generateMonthlyStatements();

      expect(result.generated_count).toBe(0);
    });
  });

  describe('getStatementsForAccount', () => {
    test('should retrieve statements in descending order', async () => {
      // Generate multiple statements (manually with different dates)
      for (let i = 0; i < 3; i++) {
        await knex('statements').insert({
          id: uuidv4(),
          account_id: testAccount.id,
          statement_date: new Date(2024, i, 15),
          closing_balance: 100.00,
          previous_balance: 50.00,
          minimum_payment_due: 25.00,
          payment_due_date: new Date(2024, i + 1, 5),
          status: 'generated'
        });
      }

      const statements = await statementService.getStatementsForAccount(testAccount.id);

      expect(statements.length).toBe(3);
      // Should be in descending order (newest first)
      expect(new Date(statements[0].statement_date) >= new Date(statements[1].statement_date)).toBe(true);
    });

    test('should limit number of statements returned', async () => {
      // Create 15 statements
      for (let i = 0; i < 15; i++) {
        await knex('statements').insert({
          id: uuidv4(),
          account_id: testAccount.id,
          statement_date: new Date(2024, 0, i + 1),
          closing_balance: 100.00,
          minimum_payment_due: 25.00,
          payment_due_date: new Date(2024, 1, i + 1),
          status: 'generated'
        });
      }

      const statements = await statementService.getStatementsForAccount(testAccount.id, 5);

      expect(statements.length).toBe(5);
    });
  });
});
