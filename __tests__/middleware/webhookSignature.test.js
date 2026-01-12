const crypto = require('crypto');
const request = require('supertest');
const express = require('express');

// We'll create this middleware next
const verifyWebhookSignature = require('../../src/middleware/webhookSignature');

describe('Webhook Signature Verification Middleware', () => {
  let app;
  const WEBHOOK_SECRET = 'test_webhook_secret_key_12345';

  beforeEach(() => {
    // Set the webhook secret for testing
    process.env.WEBHOOK_SECRET = WEBHOOK_SECRET;

    // Create test Express app with the middleware
    app = express();
    app.use(express.json());
    app.use('/webhooks', verifyWebhookSignature);

    // Test endpoint
    app.post('/webhooks/test', (req, res) => {
      res.json({ success: true, message: 'Webhook received' });
    });
  });

  afterEach(() => {
    delete process.env.WEBHOOK_SECRET;
  });

  /**
   * Helper function to generate valid HMAC signature
   * Signature format: HMAC-SHA256(timestamp + payload, secret)
   */
  function generateSignature(payload, timestamp, secret = WEBHOOK_SECRET) {
    const payloadString = JSON.stringify(payload);
    const signedPayload = `${timestamp}.${payloadString}`;
    return crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');
  }

  describe('Valid Signatures', () => {
    test('should accept request with valid signature', async () => {
      const payload = { id: 'txn_123', amount: 100 };
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = generateSignature(payload, timestamp);

      const response = await request(app)
        .post('/webhooks/test')
        .set('X-Webhook-Signature', signature)
        .set('X-Webhook-Timestamp', timestamp.toString())
        .send(payload)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should accept request with recent timestamp (within 5 minutes)', async () => {
      const payload = { id: 'txn_456', amount: 200 };
      const timestamp = Math.floor(Date.now() / 1000) - 60; // 1 minute ago
      const signature = generateSignature(payload, timestamp);

      const response = await request(app)
        .post('/webhooks/test')
        .set('X-Webhook-Signature', signature)
        .set('X-Webhook-Timestamp', timestamp.toString())
        .send(payload)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Invalid Signatures', () => {
    test('should reject request with invalid signature', async () => {
      const payload = { id: 'txn_123', amount: 100 };
      const timestamp = Math.floor(Date.now() / 1000);
      const invalidSignature = 'invalid_signature_12345';

      const response = await request(app)
        .post('/webhooks/test')
        .set('X-Webhook-Signature', invalidSignature)
        .set('X-Webhook-Timestamp', timestamp.toString())
        .send(payload)
        .expect(401);

      expect(response.body.error).toContain('Invalid signature');
    });

    test('should reject request with signature from wrong secret', async () => {
      const payload = { id: 'txn_123', amount: 100 };
      const timestamp = Math.floor(Date.now() / 1000);
      const wrongSignature = generateSignature(payload, timestamp, 'wrong_secret');

      const response = await request(app)
        .post('/webhooks/test')
        .set('X-Webhook-Signature', wrongSignature)
        .set('X-Webhook-Timestamp', timestamp.toString())
        .send(payload)
        .expect(401);

      expect(response.body.error).toContain('Invalid signature');
    });

    test('should reject request with tampered payload', async () => {
      const originalPayload = { id: 'txn_123', amount: 100 };
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = generateSignature(originalPayload, timestamp);

      // Send different payload with original signature
      const tamperedPayload = { id: 'txn_123', amount: 9999 };

      const response = await request(app)
        .post('/webhooks/test')
        .set('X-Webhook-Signature', signature)
        .set('X-Webhook-Timestamp', timestamp.toString())
        .send(tamperedPayload)
        .expect(401);

      expect(response.body.error).toContain('Invalid signature');
    });
  });

  describe('Missing Headers', () => {
    test('should reject request without signature header', async () => {
      const payload = { id: 'txn_123', amount: 100 };
      const timestamp = Math.floor(Date.now() / 1000);

      const response = await request(app)
        .post('/webhooks/test')
        .set('X-Webhook-Timestamp', timestamp.toString())
        .send(payload)
        .expect(401);

      expect(response.body.error).toContain('Missing signature');
    });

    test('should reject request without timestamp header', async () => {
      const payload = { id: 'txn_123', amount: 100 };
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = generateSignature(payload, timestamp);

      const response = await request(app)
        .post('/webhooks/test')
        .set('X-Webhook-Signature', signature)
        .send(payload)
        .expect(401);

      expect(response.body.error).toContain('Missing timestamp');
    });

    test('should reject request with missing webhook secret in env', async () => {
      delete process.env.WEBHOOK_SECRET;

      const payload = { id: 'txn_123', amount: 100 };
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = generateSignature(payload, timestamp);

      const response = await request(app)
        .post('/webhooks/test')
        .set('X-Webhook-Signature', signature)
        .set('X-Webhook-Timestamp', timestamp.toString())
        .send(payload)
        .expect(500);

      expect(response.body.error).toContain('Webhook secret not configured');
    });
  });

  describe('Replay Attack Prevention', () => {
    test('should reject request with old timestamp (> 5 minutes)', async () => {
      const payload = { id: 'txn_123', amount: 100 };
      const timestamp = Math.floor(Date.now() / 1000) - 301; // 5 minutes 1 second ago
      const signature = generateSignature(payload, timestamp);

      const response = await request(app)
        .post('/webhooks/test')
        .set('X-Webhook-Signature', signature)
        .set('X-Webhook-Timestamp', timestamp.toString())
        .send(payload)
        .expect(401);

      expect(response.body.error).toContain('timestamp too old');
    });

    test('should reject request with future timestamp', async () => {
      const payload = { id: 'txn_123', amount: 100 };
      const timestamp = Math.floor(Date.now() / 1000) + 61; // 1 minute in future
      const signature = generateSignature(payload, timestamp);

      const response = await request(app)
        .post('/webhooks/test')
        .set('X-Webhook-Signature', signature)
        .set('X-Webhook-Timestamp', timestamp.toString())
        .send(payload)
        .expect(401);

      expect(response.body.error).toContain('timestamp');
    });

    test('should reject request with invalid timestamp format', async () => {
      const payload = { id: 'txn_123', amount: 100 };
      const timestamp = 'invalid_timestamp';
      const signature = generateSignature(payload, timestamp);

      const response = await request(app)
        .post('/webhooks/test')
        .set('X-Webhook-Signature', signature)
        .set('X-Webhook-Timestamp', timestamp)
        .send(payload)
        .expect(401);

      expect(response.body.error).toContain('Invalid timestamp');
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty payload', async () => {
      const payload = {};
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = generateSignature(payload, timestamp);

      const response = await request(app)
        .post('/webhooks/test')
        .set('X-Webhook-Signature', signature)
        .set('X-Webhook-Timestamp', timestamp.toString())
        .send(payload)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should handle payload with special characters', async () => {
      const payload = {
        merchant: "Bob's Café & Grill",
        description: 'Test "quotes" and \\ slashes'
      };
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = generateSignature(payload, timestamp);

      const response = await request(app)
        .post('/webhooks/test')
        .set('X-Webhook-Signature', signature)
        .set('X-Webhook-Timestamp', timestamp.toString())
        .send(payload)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });
});
