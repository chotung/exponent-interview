Problem You are tasked to create a credit card transaction processing platform. 
 
The platform receives a webhook at https://your_domain.com/webhooks/transactions and 
responds with the following JSON: 
 
{ approved: true } 
 
or 
 
{ approved: false } 
 
Returning approved true means the transaction was approved and false means you want to 
deny the transaction. 


## Data Model Design

### Entity Relationships
```
User (1:many) Account (1:many) Card
              Account (1:many) Transaction
              Account (1:many) Statement
Merchant (1:many) Transaction
```

### Core Entities

#### User
```
id, email, first_name, last_name, created_at
```

#### Account
```
id, user_id (FK)
account_number
credit_limit, current_balance, available_credit (computed: credit_limit - current_balance)
apr_rate, statement_closing_day, payment_due_day
status (active, suspended, closed)
```

#### Card
```
id (card_123 from webhook)
account_id (FK)
card_number_last_four, card_hash
expiry_month, expiry_year
status (active, frozen, lost, stolen, closed)
spending_limit (optional)
```

#### Merchant
```
id, name, merchant_category_code
address (line_1, line_2, city, state, country)
```

#### Transaction
```
id (transaction_123 from webhook)
card_id (FK), account_id (FK), merchant_id (FK)
amount, currency
transaction_type (purchase, payment, refund, fee, interest)
status (pending, posted, declined, reversed)
previous_balance, new_balance (audit trail)
merchant_category_code, merchant_address (JSONB)
statement_id (FK, nullable)
decline_reason (if declined)
created_at, posted_at
```

#### Statement
```
id, account_id (FK)
statement_date, payment_due_date
closing_balance, previous_balance
total_purchases, total_payments, total_fees, total_interest
minimum_payment_due
status (generated, sent, paid, overdue)
```

### Authorization Logic (Webhook Handler)
```
POST /webhooks/transactions
Input: { id, card_id, amount, currency, merchant_data }

1. card = findCard(card_id)
   IF !card OR card.status != 'active' THEN return { approved: false }

2. account = findAccount(card.account_id)
   IF account.available_credit < amount THEN return { approved: false }

3. transaction = createTransaction({
     id, card_id, account_id,
     amount, status: 'pending',
     previous_balance: account.current_balance,
     new_balance: account.current_balance + amount
   })

4. account.current_balance += amount
   saveAccount(account)

5. return { approved: true }
```

### Statement Generation (Monthly Job)
```
FOR each active account:
  1. Get all posted transactions since last statement
  2. Calculate totals (purchases, payments, fees, interest)
  3. Calculate minimum_payment = max($25, balance * 0.02)
  4. Create statement with payment_due_date = closing_date + payment_due_day
  5. Link all transactions to statement_id
```

### Interest Calculation
```
daily_rate = apr_rate / 365
interest = average_daily_balance × daily_rate × days_in_cycle
Create transaction: { type: 'interest', amount: interest }
```
