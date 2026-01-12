const { v4: uuidv4 } = require('uuid');
const knex = require('../../src/db/knex');
const statementService = require('../../src/services/statementService');

// We'll create this cron job module next
let statementCron;

describe('Automated Statement Generation Cron Job', () => {
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
      current_balance: 100.00,
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

    // Add some posted transactions
    await knex('transactions').insert([
      {
        id: uuidv4(),
        card_id: testCard.id,
        account_id: testAccount.id,
        amount: 50.00,
        transaction_type: 'purchase',
        status: 'posted',
        previous_balance: 0,
        new_balance: 50.00,
        posted_at: new Date()
      },
      {
        id: uuidv4(),
        card_id: testCard.id,
        account_id: testAccount.id,
        amount: 50.00,
        transaction_type: 'purchase',
        status: 'posted',
        previous_balance: 50.00,
        new_balance: 100.00,
        posted_at: new Date()
      }
    ]);

    // Dynamically require the cron module to allow for mocking
    jest.resetModules();
    statementCron = require('../../src/jobs/statementCron');
  });

  afterEach(async () => {
    // Stop any running cron jobs
    if (statementCron && statementCron.stop) {
      statementCron.stop();
    }
  });

  afterAll(async () => {
    await knex.destroy();
  });

  describe('Cron Job Configuration', () => {
    test('should have a start function', () => {
      expect(statementCron.start).toBeDefined();
      expect(typeof statementCron.start).toBe('function');
    });

    test('should have a stop function', () => {
      expect(statementCron.stop).toBeDefined();
      expect(typeof statementCron.stop).toBe('function');
    });

    test('should have a runNow function for manual execution', () => {
      expect(statementCron.runNow).toBeDefined();
      expect(typeof statementCron.runNow).toBe('function');
    });

    test('should expose cron schedule configuration', () => {
      expect(statementCron.schedule).toBeDefined();
      // Should run daily at midnight: '0 0 * * *'
      expect(statementCron.schedule).toMatch(/^[0-9*\-,/]+\s+[0-9*\-,/]+\s+\*\s+\*\s+\*/);
    });
  });

  describe('Manual Execution (runNow)', () => {
    test('should generate statements when manually triggered', async () => {
      const result = await statementCron.runNow();

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.generated_count).toBe(1);

      // Verify statement was created
      const statement = await knex('statements')
        .where({ account_id: testAccount.id })
        .first();

      expect(statement).toBeDefined();
      expect(statement.total_purchases).toBe(100.00);
    });

    test('should handle errors gracefully during manual execution', async () => {
      // Mock statementService to throw error
      jest.spyOn(statementService, 'generateMonthlyStatements')
        .mockRejectedValueOnce(new Error('Database connection failed'));

      const result = await statementCron.runNow();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Database connection failed');

      // Restore mock
      statementService.generateMonthlyStatements.mockRestore();
    });

    test('should log execution details', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await statementCron.runNow();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Statement generation job started')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('generated')
      );

      consoleSpy.mockRestore();
    });

    test('should return execution timestamp', async () => {
      const before = Date.now();
      const result = await statementCron.runNow();
      const after = Date.now();

      expect(result.executed_at).toBeDefined();
      const executedTime = new Date(result.executed_at).getTime();
      expect(executedTime).toBeGreaterThanOrEqual(before);
      expect(executedTime).toBeLessThanOrEqual(after);
    });
  });

  describe('Scheduled Execution', () => {
    test('should start cron job without errors', () => {
      expect(() => {
        statementCron.start();
      }).not.toThrow();
    });

    test('should stop cron job without errors', () => {
      statementCron.start();

      expect(() => {
        statementCron.stop();
      }).not.toThrow();
    });

    test('should not start multiple instances', () => {
      statementCron.start();
      const result = statementCron.start();

      expect(result).toBe(false); // Should return false if already running
    });

    test('should be able to restart after stopping', () => {
      statementCron.start();
      statementCron.stop();

      expect(() => {
        statementCron.start();
      }).not.toThrow();

      statementCron.stop();
    });

    test('should indicate if job is currently running', () => {
      expect(statementCron.isRunning()).toBe(false);

      statementCron.start();
      expect(statementCron.isRunning()).toBe(true);

      statementCron.stop();
      expect(statementCron.isRunning()).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should continue running after a failed execution', async () => {
      let callCount = 0;
      jest.spyOn(statementService, 'generateMonthlyStatements')
        .mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            throw new Error('First execution fails');
          }
          return { generated_count: 1, skipped_count: 0 };
        });

      // First call should fail but not crash
      await statementCron.runNow();

      // Second call should succeed
      const result = await statementCron.runNow();
      expect(result.success).toBe(true);
      expect(callCount).toBe(2);

      statementService.generateMonthlyStatements.mockRestore();
    });

    test('should log errors when execution fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      jest.spyOn(statementService, 'generateMonthlyStatements')
        .mockRejectedValueOnce(new Error('Test error'));

      await statementCron.runNow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Statement generation failed'),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
      statementService.generateMonthlyStatements.mockRestore();
    });

    test('should not crash when statementService is unavailable', async () => {
      // Temporarily remove the service
      const originalGenerate = statementService.generateMonthlyStatements;
      delete statementService.generateMonthlyStatements;

      const result = await statementCron.runNow();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      // Restore
      statementService.generateMonthlyStatements = originalGenerate;
    });
  });

  describe('Integration with Statement Service', () => {
    test('should call statementService.generateMonthlyStatements', async () => {
      const spy = jest.spyOn(statementService, 'generateMonthlyStatements');

      await statementCron.runNow();

      expect(spy).toHaveBeenCalledTimes(1);

      spy.mockRestore();
    });

    test('should process all eligible accounts', async () => {
      // Create multiple accounts with same closing day
      const today = new Date().getDate();
      for (let i = 0; i < 3; i++) {
        const account = {
          id: uuidv4(),
          user_id: testUser.id,
          account_number: `511111111111111${i}`,
          credit_limit: 5000.00,
          current_balance: 50.00,
          statement_closing_day: today,
          payment_due_day: 21,
          status: 'active'
        };
        await knex('accounts').insert(account);
      }

      const result = await statementCron.runNow();

      // Should generate for all 4 accounts (1 original + 3 new)
      expect(result.generated_count).toBe(4);
    });

    test('should handle accounts with no transactions', async () => {
      // Delete transactions
      await knex('transactions').del();

      const result = await statementCron.runNow();

      expect(result.success).toBe(true);

      // Statement should still be created with $0 amounts
      const statement = await knex('statements')
        .where({ account_id: testAccount.id })
        .first();

      expect(statement).toBeDefined();
      expect(statement.total_purchases).toBe(0);
    });
  });

  describe('Performance and Timing', () => {
    test('should complete execution in reasonable time', async () => {
      const start = Date.now();
      await statementCron.runNow();
      const duration = Date.now() - start;

      // Should complete in under 5 seconds for small dataset
      expect(duration).toBeLessThan(5000);
    });

    test('should handle large number of accounts efficiently', async () => {
      // Create 50 test accounts
      const today = new Date().getDate();
      const accounts = [];
      for (let i = 0; i < 50; i++) {
        accounts.push({
          id: uuidv4(),
          user_id: testUser.id,
          account_number: `${4000000000000000 + i}`,
          credit_limit: 5000.00,
          current_balance: 100.00,
          statement_closing_day: today,
          payment_due_day: 21,
          status: 'active'
        });
      }
      await knex('accounts').insert(accounts);

      const start = Date.now();
      const result = await statementCron.runNow();
      const duration = Date.now() - start;

      expect(result.success).toBe(true);
      expect(result.generated_count).toBe(51); // 50 + original
      // Should complete in under 10 seconds
      expect(duration).toBeLessThan(10000);
    });
  });

  describe('Environment-based Behavior', () => {
    test('should not run in test environment if configured', () => {
      process.env.NODE_ENV = 'test';
      process.env.DISABLE_CRON_IN_TEST = 'true';

      const result = statementCron.start();

      // Should return false or not start when disabled
      expect(result).toBe(false);

      delete process.env.DISABLE_CRON_IN_TEST;
    });

    test('should use custom schedule from environment variable', () => {
      process.env.STATEMENT_CRON_SCHEDULE = '0 2 * * *'; // 2 AM daily

      jest.resetModules();
      const customCron = require('../../src/jobs/statementCron');

      expect(customCron.schedule).toBe('0 2 * * *');

      delete process.env.STATEMENT_CRON_SCHEDULE;
    });
  });
});
