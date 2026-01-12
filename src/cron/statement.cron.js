// statement.cron.js
const cron = require('node-cron');
const statementService = require('../services/statementService');

/**
 * Runs DAILY
 * StatementService decides which accounts actually close today
 */
cron.schedule('0 2 * * *', async () => {
  console.log('🧾 Running daily statement billing cycle job');

  try {
    const result = await statementService.generateMonthlyStatements();

    console.log(
      `🧾 Statement job finished — ` +
      `Generated: ${result.generated_count}, ` +
      `Skipped: ${result.skipped_count}`
    );
  } catch (error) {
    console.error('❌ Statement cron failed:', error);
  }
});
