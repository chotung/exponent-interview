# Kubernetes Deployment Guide for AWS EKS

This directory contains Kubernetes manifests for deploying the Credit Card Transaction Platform to AWS EKS.

## Prerequisites

1. **AWS Account** with appropriate permissions
2. **AWS CLI** installed and configured
3. **kubectl** installed
4. **eksctl** (optional, for easy EKS cluster creation)
5. **Docker** for building images

## Architecture

```
Internet
    ↓
AWS ALB (Application Load Balancer)
    ↓
Kubernetes Ingress
    ↓
Service (ClusterIP)
    ↓
Pods (3 replicas, auto-scaling 3-10)
    ↓
AWS RDS PostgreSQL
```

## Setup Steps (Mock - Do Not Actually Deploy)

### 1. Create EKS Cluster

```bash
# Using eksctl (easiest method)
eksctl create cluster \
  --name credit-card-platform \
  --region us-east-1 \
  --nodegroup-name standard-workers \
  --node-type t3.medium \
  --nodes 3 \
  --nodes-min 3 \
  --nodes-max 6 \
  --managed

# Configure kubectl
aws eks update-kubeconfig --name credit-card-platform --region us-east-1
```

### 2. Install AWS Load Balancer Controller

```bash
# Add IAM policy for ALB controller
curl -o iam-policy.json https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/main/docs/install/iam_policy.json
aws iam create-policy --policy-name AWSLoadBalancerControllerIAMPolicy --policy-document file://iam-policy.json

# Install with Helm
helm repo add eks https://aws.github.io/eks-charts
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=credit-card-platform
```

### 3. Create RDS PostgreSQL Instance

```bash
# Via AWS Console or CLI
aws rds create-db-instance \
  --db-instance-identifier credit-card-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 15.3 \
  --master-username creditcardadmin \
  --master-user-password 'YourSecurePassword123!' \
  --allocated-storage 20 \
  --vpc-security-group-ids sg-12345678 \
  --db-subnet-group-name your-db-subnet-group \
  --backup-retention-period 7 \
  --multi-az
```

### 4. Build and Push Docker Image to ECR

```bash
# Create ECR repository
aws ecr create-repository --repository-name credit-card-platform --region us-east-1

# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-east-1.amazonaws.com

# Build image
docker build -t credit-card-platform .

# Tag image
docker tag credit-card-platform:latest 123456789012.dkr.ecr.us-east-1.amazonaws.com/credit-card-platform:latest

# Push to ECR
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/credit-card-platform:latest
```

### 5. Create ECR Pull Secret

```bash
kubectl create secret docker-registry ecr-secret \
  --docker-server=123456789012.dkr.ecr.us-east-1.amazonaws.com \
  --docker-username=AWS \
  --docker-password=$(aws ecr get-login-password --region us-east-1) \
  --namespace=credit-card-platform
```

### 6. Update Configuration

Edit the following files with your actual values:

**k8s/configmap.yaml:**
```yaml
DB_HOST: your-rds-instance.abc123.us-east-1.rds.amazonaws.com
```

**k8s/secret.yaml:**
```bash
# Base64 encode your RDS password
echo -n "YourRDSPassword" | base64
# Update DB_PASSWORD in secret.yaml with the encoded value
```

**k8s/deployment.yaml:**
```yaml
image: 123456789012.dkr.ecr.us-east-1.amazonaws.com/credit-card-platform:latest
```

**k8s/ingress.yaml:**
```yaml
alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:us-east-1:123456789012:certificate/your-cert-id
host: api.creditcard.example.com
```

### 7. Deploy to Kubernetes

```bash
# Create namespace
kubectl apply -f k8s/namespace.yaml

# Create ConfigMap and Secret
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml

# Deploy application
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml

# Setup autoscaling
kubectl apply -f k8s/hpa.yaml

# Optional: Deploy PostgreSQL in cluster (dev only)
kubectl apply -f k8s/postgres-statefulset.yaml
```

### 8. Verify Deployment

```bash
# Check pods
kubectl get pods -n credit-card-platform

# Check service
kubectl get svc -n credit-card-platform

# Check ingress and get ALB URL
kubectl get ingress -n credit-card-platform

# View logs
kubectl logs -f deployment/credit-card-platform -n credit-card-platform

# Test health endpoint
kubectl port-forward svc/credit-card-platform-service 8080:80 -n credit-card-platform
curl http://localhost:8080/health
```

### 9. Test Webhook

```bash
curl -X POST https://api.creditcard.example.com/webhooks/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "id": "transaction_123",
    "card_id": "card_456",
    "amount": 5000,
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

## Monitoring and Maintenance

### View Metrics
```bash
# CPU and Memory usage
kubectl top pods -n credit-card-platform

# HPA status
kubectl get hpa -n credit-card-platform

# Events
kubectl get events -n credit-card-platform --sort-by='.lastTimestamp'
```

### Scaling
```bash
# Manual scaling
kubectl scale deployment credit-card-platform --replicas=5 -n credit-card-platform

# Update HPA limits
kubectl edit hpa credit-card-platform-hpa -n credit-card-platform
```

### Rolling Updates
```bash
# Update image
kubectl set image deployment/credit-card-platform \
  credit-card-platform=123456789012.dkr.ecr.us-east-1.amazonaws.com/credit-card-platform:v2.0.0 \
  -n credit-card-platform

# Check rollout status
kubectl rollout status deployment/credit-card-platform -n credit-card-platform

# Rollback if needed
kubectl rollout undo deployment/credit-card-platform -n credit-card-platform
```

## Cost Optimization

1. **Use Spot Instances** for non-critical workloads
2. **Right-size pods** based on actual resource usage
3. **Enable cluster autoscaler** to scale nodes based on demand
4. **Use RDS instance sizing** appropriate for your load
5. **Enable S3 for backups** instead of EBS snapshots

## Security Best Practices

1. **Use AWS Secrets Manager** via External Secrets Operator
2. **Enable Pod Security Standards**
3. **Use Network Policies** to restrict pod-to-pod communication
4. **Enable AWS WAF** on ALB
5. **Rotate credentials regularly**
6. **Enable audit logging**
7. **Use VPC endpoints** for AWS services

## Cleanup (When Done Testing)

```bash
# Delete Kubernetes resources
kubectl delete -f k8s/

# Delete EKS cluster
eksctl delete cluster --name credit-card-platform --region us-east-1

# Delete RDS instance
aws rds delete-db-instance --db-instance-identifier credit-card-db --skip-final-snapshot

# Delete ECR repository
aws ecr delete-repository --repository-name credit-card-platform --region us-east-1 --force
```
