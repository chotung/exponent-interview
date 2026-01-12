# Deployment Guide

Complete guide for local development and AWS EKS production deployment.

## Quick Start - Local Development

### Option 1: SQLite (Simplest)

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Edit .env and set DATABASE_TYPE=sqlite

# Run migrations
npm run migrate

# Seed test data
node scripts/seed-data.js

# Start server
npm run dev
```

Server runs at `http://localhost:3000`

### Option 2: Docker Compose with PostgreSQL

```bash
# Start all services (app + PostgreSQL)
docker-compose up

# Or run in background
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop services
docker-compose down

# With pgAdmin for database management
docker-compose --profile tools up
# Access pgAdmin at http://localhost:5050 (admin@admin.com / admin)
```

## Testing the API

### Health Check
```bash
curl http://localhost:3000/health
```

### Test Transaction Authorization

After seeding data, test with the provided card ID:

```bash
curl -X POST http://localhost:3000/webhooks/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "id": "txn_test_001",
    "card_id": "card_XXXXXXXX",
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
  }'
```

Expected response: `{"approved": true}` or `{"approved": false}`

### View Account Details
```bash
curl http://localhost:3000/accounts/{account_id}
```

### View Transactions
```bash
curl http://localhost:3000/accounts/{account_id}/transactions
```

## Production Deployment to AWS EKS

See [k8s/README.md](./k8s/README.md) for complete AWS deployment instructions.

### High-Level Steps:

1. **Create AWS Infrastructure**
   - EKS Cluster
   - RDS PostgreSQL instance
   - ECR repository for Docker images
   - VPC, subnets, security groups

2. **Build and Push Docker Image**
   ```bash
   docker build -t credit-card-platform .
   docker tag credit-card-platform:latest {ECR_URL}/credit-card-platform:latest
   docker push {ECR_URL}/credit-card-platform:latest
   ```

3. **Configure Kubernetes**
   - Update k8s manifests with actual values
   - Create secrets for database credentials
   - Deploy to cluster

4. **Deploy Application**
   ```bash
   kubectl apply -f k8s/namespace.yaml
   kubectl apply -f k8s/configmap.yaml
   kubectl apply -f k8s/secret.yaml
   kubectl apply -f k8s/deployment.yaml
   kubectl apply -f k8s/service.yaml
   kubectl apply -f k8s/ingress.yaml
   kubectl apply -f k8s/hpa.yaml
   ```

## Switching from SQLite to PostgreSQL

The application is designed to easily switch between SQLite (dev) and PostgreSQL (prod).

### Code Changes: NONE REQUIRED
All queries use parameter placeholders that work with both databases.

### Configuration Changes:
```bash
# In .env or Kubernetes ConfigMap
DATABASE_TYPE=postgres
DB_HOST=your-postgres-host
DB_PORT=5432
DB_NAME=credit_card_platform
DB_USER=credit_card_app
DB_PASSWORD=your_password
```

### Migration Notes:
- SQLite uses `?` for parameter placeholders
- PostgreSQL uses `$1, $2, $3` for parameters
- The connection abstraction layer in `src/db/connection.js` handles this
- Schema is compatible with both (with minor type differences noted in comments)

## Environment Variables

### Required
- `DATABASE_TYPE` - 'sqlite' or 'postgres'
- `PORT` - Server port (default: 3000)

### For SQLite
- `SQLITE_DB_PATH` - Path to SQLite file (default: ./data/credit_card.db)

### For PostgreSQL
- `DB_HOST` - Database host
- `DB_PORT` - Database port (default: 5432)
- `DB_NAME` - Database name
- `DB_USER` - Database user
- `DB_PASSWORD` - Database password
- `DB_POOL_MAX` - Max connections (default: 20)
- `DB_SSL` - Enable SSL (true for RDS)

### Optional
- `NODE_ENV` - Environment (development/production)
- `DATABASE_URL` - Full PostgreSQL connection string (alternative to individual params)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Express Server                        │
│                   (src/server.js)                        │
└────────────┬────────────────────────────────────────────┘
             │
             ├─ POST /webhooks/transactions
             ├─ GET  /health
             ├─ GET  /ready
             └─ GET  /accounts/:id

┌────────────▼────────────────────────────────────────────┐
│              Transaction Service                         │
│         (src/services/transactionService.js)             │
│  • Authorization logic                                   │
│  • Balance validation                                    │
│  • Fraud checks                                          │
└────────────┬────────────────────────────────────────────┘
             │
┌────────────▼────────────────────────────────────────────┐
│              Repositories                                │
│  • cardRepository      (Card CRUD)                       │
│  • accountRepository   (Account & Balance)               │
│  • transactionRepository (Transaction History)           │
└────────────┬────────────────────────────────────────────┘
             │
┌────────────▼────────────────────────────────────────────┐
│          Database Connection Layer                       │
│         (src/db/connection.js)                           │
│  • Abstracts SQLite vs PostgreSQL                        │
│  • Handles sync vs async operations                      │
└────────────┬────────────────────────────────────────────┘
             │
             ├─ SQLite (Development)
             └─ PostgreSQL (Production / AWS RDS)
```

## Monitoring

### Kubernetes Health Checks
- **Liveness Probe**: `/health` - Restarts pod if unhealthy
- **Readiness Probe**: `/ready` - Removes from service if not ready

### Logs
```bash
# Local
npm run dev  # Shows console logs

# Docker
docker-compose logs -f app

# Kubernetes
kubectl logs -f deployment/credit-card-platform -n credit-card-platform
```

### Metrics
```bash
# Kubernetes resource usage
kubectl top pods -n credit-card-platform

# Autoscaling status
kubectl get hpa -n credit-card-platform
```

## Security Considerations

1. **Secrets Management**
   - Never commit `.env` files
   - Use AWS Secrets Manager in production
   - Rotate credentials regularly

2. **Database Security**
   - Use strong passwords
   - Enable SSL/TLS for PostgreSQL
   - Use IAM authentication for RDS (recommended)
   - Restrict network access via security groups

3. **Application Security**
   - Helmet.js enabled for security headers
   - Input validation on webhook endpoint
   - Non-root user in Docker container
   - Read-only filesystem (except /app/data for SQLite)

4. **Network Security**
   - WAF on ALB (recommended)
   - VPC isolation
   - Network policies in Kubernetes

## Troubleshooting

### SQLite: Database locked
- Only one writer at a time
- Use PostgreSQL for production with concurrent writes

### Cannot connect to database
```bash
# Check database is running
docker-compose ps

# Test connection
psql -h localhost -U credit_card_app -d credit_card_platform

# Check logs
docker-compose logs postgres
```

### Kubernetes pod not starting
```bash
# Check pod status
kubectl describe pod {pod-name} -n credit-card-platform

# View events
kubectl get events -n credit-card-platform

# Check logs
kubectl logs {pod-name} -n credit-card-platform
```

### Transaction declined
- Check card status is 'active'
- Check account has sufficient credit
- Check account status is 'active'
- View logs for decline reason
