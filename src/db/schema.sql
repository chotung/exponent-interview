-- Credit Card Transaction Platform Schema
-- Compatible with SQLite and PostgreSQL (with minor modifications)
--
-- For PostgreSQL production deployment:
-- 1. Replace INTEGER PRIMARY KEY with SERIAL PRIMARY KEY or UUID
-- 2. Replace REAL with DECIMAL(12, 2) for money
-- 3. Replace DATETIME with TIMESTAMP
-- 4. Add proper constraints and indexes

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,  -- Use UUID in production PostgreSQL
    email TEXT UNIQUE NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Accounts table
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,  -- Use UUID in production PostgreSQL
    user_id TEXT NOT NULL,
    account_number TEXT UNIQUE NOT NULL,
    credit_limit REAL NOT NULL DEFAULT 0.00,  -- Use DECIMAL(12,2) in PostgreSQL
    current_balance REAL NOT NULL DEFAULT 0.00,  -- Use DECIMAL(12,2) in PostgreSQL
    apr_rate REAL DEFAULT 19.99,  -- Use DECIMAL(5,2) in PostgreSQL
    statement_closing_day INTEGER CHECK (statement_closing_day BETWEEN 1 AND 28),
    payment_due_day INTEGER CHECK (payment_due_day BETWEEN 1 AND 28),
    minimum_payment_percentage REAL DEFAULT 2.00,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT positive_credit_limit CHECK (credit_limit >= 0),
    CONSTRAINT valid_balance CHECK (current_balance >= 0)
);

-- Cards table
CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,  -- card_123 from webhook
    account_id TEXT NOT NULL,
    card_number_last_four TEXT NOT NULL,
    card_hash TEXT UNIQUE NOT NULL,
    expiry_month INTEGER CHECK (expiry_month BETWEEN 1 AND 12),
    expiry_year INTEGER,
    card_type TEXT DEFAULT 'physical' CHECK (card_type IN ('physical', 'virtual')),
    spending_limit REAL,  -- Use DECIMAL(12,2) in PostgreSQL
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'lost', 'stolen', 'closed')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- Merchants table
CREATE TABLE IF NOT EXISTS merchants (
    id TEXT PRIMARY KEY,  -- Use UUID in production PostgreSQL
    name TEXT,
    merchant_category_code INTEGER NOT NULL,
    address_line_1 TEXT,
    address_line_2 TEXT,
    city TEXT,
    state TEXT,
    country TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,  -- transaction_123 from webhook
    card_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    merchant_id TEXT,
    amount REAL NOT NULL,  -- Use DECIMAL(12,2) in PostgreSQL
    currency TEXT DEFAULT 'usd',
    transaction_type TEXT DEFAULT 'purchase' CHECK (
        transaction_type IN ('purchase', 'payment', 'refund', 'fee', 'interest', 'adjustment')
    ),
    status TEXT DEFAULT 'pending' CHECK (
        status IN ('pending', 'posted', 'declined', 'reversed')
    ),
    previous_balance REAL NOT NULL,  -- Use DECIMAL(12,2) in PostgreSQL
    new_balance REAL NOT NULL,  -- Use DECIMAL(12,2) in PostgreSQL
    authorization_code TEXT,
    decline_reason TEXT,
    merchant_category_code INTEGER,
    merchant_name TEXT,
    merchant_address TEXT,  -- JSON string for SQLite, JSONB for PostgreSQL
    statement_id TEXT,
    posted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (card_id) REFERENCES cards(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    FOREIGN KEY (merchant_id) REFERENCES merchants(id),
    FOREIGN KEY (statement_id) REFERENCES statements(id)
);

-- Statements table
CREATE TABLE IF NOT EXISTS statements (
    id TEXT PRIMARY KEY,  -- Use UUID in production PostgreSQL
    account_id TEXT NOT NULL,
    statement_date DATE NOT NULL,
    closing_balance REAL NOT NULL DEFAULT 0.00,  -- Use DECIMAL(12,2) in PostgreSQL
    previous_balance REAL NOT NULL DEFAULT 0.00,
    total_purchases REAL NOT NULL DEFAULT 0.00,
    total_payments REAL NOT NULL DEFAULT 0.00,
    total_fees REAL NOT NULL DEFAULT 0.00,
    total_interest REAL NOT NULL DEFAULT 0.00,
    minimum_payment_due REAL NOT NULL DEFAULT 0.00,
    payment_due_date DATE NOT NULL,
    status TEXT DEFAULT 'generated' CHECK (
        status IN ('generated', 'sent', 'paid', 'overdue')
    ),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    UNIQUE(account_id, statement_date)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);
CREATE INDEX IF NOT EXISTS idx_cards_account_id ON cards(account_id);
CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status);
CREATE INDEX IF NOT EXISTS idx_transactions_card_id ON transactions(card_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_statements_account_id ON statements(account_id);
CREATE INDEX IF NOT EXISTS idx_statements_payment_due_date ON statements(payment_due_date);
