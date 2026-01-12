/**
 * Seed Script - Creates sample data for testing
 *
 * Run with: node scripts/seed-data.js
 */

require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// Import repositories
const db = require('../src/db/connection');

function hashCardNumber(cardNumber) {
  return crypto.createHash('sha256').update(cardNumber).digest('hex');
}

async function seedData() {
  console.log('Starting data seeding...\n');

  try {
    // Create test user
    const userId = uuidv4();
    console.log('Creating user...');
    db.run(
      `INSERT INTO users (id, email, first_name, last_name) VALUES (?, ?, ?, ?)`,
      [userId, 'john.doe@example.com', 'John', 'Doe']
    );
    console.log(`✓ User created: ${userId}`);

    // Create test account
    const accountId = uuidv4();
    console.log('\nCreating account...');
    db.run(
      `INSERT INTO accounts (
        id, user_id, account_number, credit_limit, current_balance,
        apr_rate, statement_closing_day, payment_due_day, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [accountId, userId, '4111111111111111', 5000.00, 0.00, 19.99, 15, 25, 'active']
    );
    console.log(`✓ Account created: ${accountId}`);
    console.log(`  Account Number: 4111111111111111`);
    console.log(`  Credit Limit: $5,000.00`);

    // Create test card
    const cardId = 'card_' + uuidv4().substring(0, 8);
    const fullCardNumber = '4111111111111111';
    console.log('\nCreating card...');
    db.run(
      `INSERT INTO cards (
        id, account_id, card_number_last_four, card_hash,
        expiry_month, expiry_year, card_type, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cardId,
        accountId,
        '1111',
        hashCardNumber(fullCardNumber),
        12,
        2026,
        'physical',
        'active'
      ]
    );
    console.log(`✓ Card created: ${cardId}`);
    console.log(`  Last 4: 1111`);
    console.log(`  Expiry: 12/2026`);

    // Create sample merchant
    const merchantId = uuidv4();
    console.log('\nCreating merchant...');
    db.run(
      `INSERT INTO merchants (
        id, name, merchant_category_code, address_line_1, city, state, country
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        merchantId,
        'Amazon.com',
        5411,
        '410 Terry Ave N',
        'Seattle',
        'WA',
        'US'
      ]
    );
    console.log(`✓ Merchant created: ${merchantId}`);
    console.log(`  Name: Amazon.com`);

    console.log('\n═══════════════════════════════════════');
    console.log('Seed data created successfully!');
    console.log('═══════════════════════════════════════');
    console.log('\nTest Data Summary:');
    console.log(`User ID:    ${userId}`);
    console.log(`Account ID: ${accountId}`);
    console.log(`Card ID:    ${cardId}`);
    console.log(`Merchant ID: ${merchantId}`);
    console.log('\nTest Transaction:');
    console.log(`
curl -X POST http://localhost:3000/webhooks/transactions \\
  -H "Content-Type: application/json" \\
  -d '{
    "id": "txn_test_001",
    "card_id": "${cardId}",
    "amount": 2500,
    "currency": "usd",
    "merchant_data": {
      "category": 5411,
      "address": {
        "line_1": "410 Terry Ave N",
        "city": "Seattle",
        "state": "WA",
        "country": "US"
      }
    }
  }'
    `);

  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedData()
    .then(() => {
      console.log('\nSeeding complete. Exiting...');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seeding failed:', error);
      process.exit(1);
    });
}

module.exports = seedData;
