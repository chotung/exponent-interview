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

## Implementation Status

### ✅ Implemented (MVP - Core Features)
**Webhooks:**
- `POST /webhooks/transactions` - Authorization (approve/decline in real-time)
- `POST /webhooks/settlements` - Settlement (finalize transactions)

**APIs:**
- `POST /payments` - Payment processing (user pays bill)
- `GET /payments/:accountId` - Payment history
- `POST /statements/generate` - Statement generation (manual trigger)
- `GET /statements/account/:accountId` - Get account statements
- `GET /statements/:statementId` - Get specific statement
- `GET /accounts/:accountId` - Account details
- `GET /accounts/:accountId/transactions` - Transaction history

**Infrastructure:**
- Data model with versioned migrations (Knex)
- Repository pattern for data access
- Service layer for business logic
- SQLite (dev) / PostgreSQL (prod) support
- Docker + Kubernetes deployment configs
- Health checks for K8s probes

### ❌ Missing Features (Nice to Have)
1. **Refund/Reversal Webhook** - Handle returns and chargebacks
2. **Interest Accrual Service** - Calculate and apply monthly interest charges
3. **Late Fee Processing** - Apply fees for overdue payments
4. **Automated Statement Generation** - Cron job (currently manual via API)
5. **Webhook Signature Verification** - HMAC validation for security
6. **Rate Limiting** - Prevent abuse/DDoS
7. **Audit Logging** - Compliance and debugging

### 🔧 Technical Debt
- Add tests (unit + integration)
- Add TypeScript types
- Implement proper error handling for edge cases
- Add request validation middleware
- Database indexes optimization
- Connection pool tuning

## Production Scaling Considerations

### Current Architecture (MVP)
- Single region (AWS us-east-1)
- RDS PostgreSQL Multi-AZ
- EKS with 3-10 pod autoscaling
- Application Load Balancer
- Target: < 500ms authorization latency

### Scaling Upgrades (When Needed)

**Performance (> 1000 TPS)**
- Add Redis caching layer for hot account data
- Increase database connection pool (10-100)
- Separate webhook service from API service
- RDS read replicas for reporting queries

**High Availability**
- Multi-region active-active deployment
- Global database with cross-region replication
- Route 53 latency-based routing
- CloudFront for static assets

**Observability**
- AWS X-Ray for distributed tracing
- Enhanced CloudWatch metrics (P95, P99 latency)
- Structured logging (JSON) to ELK/CloudWatch
- PagerDuty integration for critical alerts

**Security**
- AWS WAF with rate limiting (100 req/sec per IP)
- Webhook signature verification (HMAC-SHA256)
- Secrets Manager for credential rotation
- VPC endpoints for private connectivity

**Database Optimization**
- Connection pooling: min=10, max=100
- Database query optimization (EXPLAIN ANALYZE)
- Materialized views for reporting
- Partitioning for large transaction tables

---

## Complete Feature Checklist

### Authorization & Transaction Processing
- ✅ Real-time authorization webhook
- ✅ Card status validation (active/frozen/closed)
- ✅ Credit limit checking
- ✅ Transaction creation with audit trail (previous_balance, new_balance)
- ✅ Balance updates
- ✅ Idempotent transaction handling (duplicate prevention)
- ⚠️ Authorization adjustments (partial - in settlement service)
- ❌ Fraud detection rules
- ❌ Merchant category blocking
- ❌ Velocity checks (max transactions per timeframe)

### Settlement & Clearing
- ✅ Settlement webhook (pending → posted)
- ✅ Authorization adjustment handling (final amount differs)
- ✅ Transaction status management
- ❌ Batch settlement processing
- ❌ Settlement reconciliation reports

### Payments & Billing
- ✅ Payment processing API
- ✅ Payment history retrieval
- ✅ Balance reduction
- ❌ Payment reversals/cancellations
- ❌ Scheduled/recurring payments
- ❌ Payment method management

### Statements & Billing Cycle
- ✅ Statement generation (manual)
- ✅ Transaction aggregation by statement period
- ✅ Minimum payment calculation
- ✅ Statement retrieval APIs
- ✅ Payment due date calculation
- ✅ Automated monthly generation (cron)
- ❌ Statement email delivery
- ❌ PDF statement generation
- ❌ Promotional credits

### Interest & Fees
- ❌ Interest calculation service
- ❌ Interest accrual job (monthly)
- ❌ Late fee processing
- ❌ Annual fee processing
- ❌ Foreign transaction fees
- ❌ Grace period handling

### Disputes & Chargebacks
- ❌ Refund webhook
- ❌ Chargeback handling
- ❌ Dispute tracking
- ❌ Provisional credit management

### Account Management
- ✅ Account balance tracking
- ✅ Available credit calculation
- ✅ Account status management
- ❌ Credit limit increase requests
- ❌ Account closure workflow
- ❌ Multiple cards per account

### Reporting & Analytics
- ✅ Transaction history by account
- ❌ Spending by merchant category
- ❌ Statement history reports
- ❌ Account aging reports
- ❌ Delinquency tracking

### Security & Compliance
- ❌ Webhook signature verification
- ❌ Rate limiting (application level)
- ❌ PCI DSS compliance audit trail
- ❌ Data encryption at rest
- ❌ Access control/authorization
- ❌ API key management

### Operations & Monitoring
- ✅ Health check endpoint
- ✅ Database readiness check
- ❌ Metrics collection (Prometheus)
- ❌ Distributed tracing (X-Ray)
- ❌ Error alerting (PagerDuty)
- ❌ Performance monitoring

---

## Quick Start

See [DEPLOYMENT.md](./DEPLOYMENT.md) for setup instructions.
See [API.md](./API.md) for complete API documentation.
See [MIGRATIONS.md](./MIGRATIONS.md) for database migration guide.
