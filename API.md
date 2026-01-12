# API Documentation

## Overview

The Credit Card Transaction Platform provides RESTful APIs for transaction processing, payment handling, and statement generation.

## Base URL
```
http://localhost:3000
```

---

## Webhooks

### 1. Authorization Webhook
**POST** `/webhooks/transactions`

Authorize or decline a credit card transaction in real-time.

**Request:**
```json
{
  "id": "transaction_123",
  "card_id": "card_456",
  "amount": 2500,
  "currency": "usd",
  "merchant_data": {
    "category": 5411,
    "address": {
      "line_1": "123 Main St",
      "city": "New York",
      "state": "NY",
      "country": "US"
    }
  }
}
```

**Response:**
```json
{
  "approved": true
}
```

**Business Logic:**
- Checks if card is active
- Verifies available credit
- Creates transaction with status `pending`
- Updates account balance immediately

---

### 2. Settlement Webhook
**POST** `/webhooks/settlements`

Finalize a pending transaction (typically 1-3 days after authorization).

**Request:**
```json
{
  "transaction_id": "transaction_123",
  "final_amount": 85.00
}
```

**Response:**
```json
{
  "settled": true
}
```

**Business Logic:**
- Updates transaction status from `pending` → `posted`
- Handles authorization adjustments (if `final_amount` differs)
- Only settles pending transactions

---

## Payments

### 3. Process Payment
**POST** `/payments`

Process a credit card payment from the user.

**Request:**
```json
{
  "account_id": "account_123",
  "amount": 100.00
}
```

**Response:**
```json
{
  "success": true,
  "transaction_id": "payment_abc123",
  "new_balance": 50.00,
  "amount_paid": 100.00,
  "previous_balance": 150.00
}
```

**Business Logic:**
- Creates transaction with type `payment` and negative amount
- Decreases account balance
- Status is `posted` immediately

---

### 4. Get Payment History
**GET** `/payments/:accountId`

Retrieve payment history for an account.

**Response:**
```json
{
  "account_id": "account_123",
  "count": 5,
  "payments": [
    {
      "id": "payment_001",
      "amount": -100.00,
      "transaction_type": "payment",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

---

## Statements

### 5. Generate Statements (Manual)
**POST** `/statements/generate`

Manually trigger statement generation for all eligible accounts.

**Response:**
```json
{
  "success": true,
  "generated_count": 5,
  "skipped_count": 2
}
```

**Business Logic:**
- Finds accounts where `statement_closing_day` = today
- Calculates totals from posted transactions
- Creates statement with minimum payment due
- Links transactions to statement
- Typically run via cron job daily

---

### 6. Get Account Statements
**GET** `/statements/account/:accountId`

Get all statements for an account.

**Response:**
```json
{
  "account_id": "account_123",
  "count": 3,
  "statements": [
    {
      "id": "statement_001",
      "statement_date": "2024-01-15",
      "closing_balance": 150.00,
      "minimum_payment_due": 25.00,
      "payment_due_date": "2024-02-05",
      "status": "generated"
    }
  ]
}
```

---

### 7. Get Specific Statement
**GET** `/statements/:statementId`

Get details of a specific statement.

**Response:**
```json
{
  "id": "statement_123",
  "account_id": "account_456",
  "statement_date": "2024-01-15",
  "closing_balance": 150.00,
  "previous_balance": 100.00,
  "total_purchases": 75.00,
  "total_payments": 25.00,
  "total_fees": 0.00,
  "total_interest": 0.00,
  "minimum_payment_due": 25.00,
  "payment_due_date": "2024-02-05",
  "status": "generated"
}
```

---

## Accounts

### 8. Get Account Details
**GET** `/accounts/:accountId`

Get account information including available credit.

**Response:**
```json
{
  "id": "account_123",
  "user_id": "user_456",
  "credit_limit": 5000.00,
  "current_balance": 150.00,
  "available_credit": 4850.00,
  "apr_rate": 19.99,
  "status": "active"
}
```

---

### 9. Get Account Transactions
**GET** `/accounts/:accountId/transactions?limit=50`

Get transaction history for an account.

**Response:**
```json
{
  "account_id": "account_123",
  "count": 10,
  "transactions": [
    {
      "id": "transaction_001",
      "amount": 25.00,
      "transaction_type": "purchase",
      "status": "posted",
      "merchant_name": "Starbucks",
      "created_at": "2024-01-10T08:30:00Z"
    }
  ]
}
```

---

## Health Checks

### 10. Health Check
**GET** `/health`

Basic health check (for load balancers).

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "uptime": 3600
}
```

---

### 11. Readiness Check
**GET** `/ready`

Check if server is ready (includes database connectivity).

**Response:**
```json
{
  "status": "ready",
  "database": "connected"
}
```

---

## Transaction Lifecycle

```
1. Authorization (Pending)
   POST /webhooks/transactions
   → Transaction created with status='pending'
   → Balance increased immediately

2. Settlement (Posted)
   POST /webhooks/settlements
   → Transaction status: 'pending' → 'posted'
   → Final amount locked in

3. Statement Generation (Monthly)
   POST /statements/generate (or cron job)
   → Creates statement with all posted transactions
   → Calculates minimum payment due

4. Payment (Balance Decrease)
   POST /payments
   → User pays bill
   → Balance decreased
   → Transaction type='payment'
```

---

## Error Responses

All endpoints return standard error responses:

**400 Bad Request:**
```json
{
  "success": false,
  "error": "Missing required fields: account_id, amount"
}
```

**404 Not Found:**
```json
{
  "success": false,
  "error": "Account not found"
}
```

**500 Internal Server Error:**
```json
{
  "success": false,
  "error": "Internal server error",
  "message": "Database connection failed"
}
```

---

## Automated Jobs (TODO)

For production, add cron job to run daily:

```javascript
// Run statement generation daily at 2am
const cron = require('node-cron');

cron.schedule('0 2 * * *', async () => {
  await statementService.generateMonthlyStatements();
});
```

Install: `npm install node-cron`
