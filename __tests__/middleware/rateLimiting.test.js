const request = require('supertest');
const express = require('express');

// We'll create this middleware next
const rateLimiter = require('../../src/middleware/rateLimiting');

describe('Rate Limiting Middleware', () => {
  let app;

  beforeEach(() => {
    // Create test Express app with rate limiting
    app = express();
    app.use(express.json());

    // Apply rate limiter to webhook endpoints
    // Limit: 10 requests per minute per IP
    app.use('/webhooks', rateLimiter({
      windowMs: 60 * 1000, // 1 minute
      max: 10, // 10 requests per window
      message: 'Too many requests, please try again later'
    }));

    // Test endpoint
    app.post('/webhooks/test', (req, res) => {
      res.json({ success: true });
    });
  });

  describe('Basic Rate Limiting', () => {
    test('should allow requests under the rate limit', async () => {
      // Make 5 requests (under limit of 10)
      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .post('/webhooks/test')
          .send({ test: i })
          .expect(200);

        expect(response.body.success).toBe(true);
      }
    });

    test('should block requests exceeding the rate limit', async () => {
      // Make 10 successful requests (at limit)
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post('/webhooks/test')
          .send({ test: i })
          .expect(200);
      }

      // 11th request should be blocked
      const response = await request(app)
        .post('/webhooks/test')
        .send({ test: 11 })
        .expect(429);

      expect(response.body.error).toContain('Too many requests');
    });

    test('should return rate limit headers', async () => {
      const response = await request(app)
        .post('/webhooks/test')
        .send({ test: 1 })
        .expect(200);

      // Check for standard rate limit headers
      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
      expect(response.headers['x-ratelimit-reset']).toBeDefined();

      // First request should have 9 remaining (10 - 1)
      expect(response.headers['x-ratelimit-limit']).toBe('10');
      expect(response.headers['x-ratelimit-remaining']).toBe('9');
    });

    test('should decrement remaining count with each request', async () => {
      // First request
      let response = await request(app)
        .post('/webhooks/test')
        .send({})
        .expect(200);
      expect(response.headers['x-ratelimit-remaining']).toBe('9');

      // Second request
      response = await request(app)
        .post('/webhooks/test')
        .send({})
        .expect(200);
      expect(response.headers['x-ratelimit-remaining']).toBe('8');

      // Third request
      response = await request(app)
        .post('/webhooks/test')
        .send({})
        .expect(200);
      expect(response.headers['x-ratelimit-remaining']).toBe('7');
    });

    test('should show 0 remaining when at limit', async () => {
      // Make 10 requests to hit the limit
      let lastResponse;
      for (let i = 0; i < 10; i++) {
        lastResponse = await request(app)
          .post('/webhooks/test')
          .send({})
          .expect(200);
      }

      expect(lastResponse.headers['x-ratelimit-remaining']).toBe('0');
    });
  });

  describe('IP-based Rate Limiting', () => {
    test('should track rate limits separately per IP address', async () => {
      // Make 10 requests from IP 1
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post('/webhooks/test')
          .set('X-Forwarded-For', '192.168.1.100')
          .send({ test: i })
          .expect(200);
      }

      // Next request from IP 1 should be blocked
      await request(app)
        .post('/webhooks/test')
        .set('X-Forwarded-For', '192.168.1.100')
        .send({ test: 11 })
        .expect(429);

      // But request from different IP should succeed
      const response = await request(app)
        .post('/webhooks/test')
        .set('X-Forwarded-For', '192.168.1.200')
        .send({ test: 1 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.headers['x-ratelimit-remaining']).toBe('9');
    });

    test('should use X-Forwarded-For header for IP detection', async () => {
      const response = await request(app)
        .post('/webhooks/test')
        .set('X-Forwarded-For', '10.0.0.1')
        .send({})
        .expect(200);

      expect(response.headers['x-ratelimit-remaining']).toBe('9');
    });

    test('should fallback to req.ip when X-Forwarded-For is missing', async () => {
      const response = await request(app)
        .post('/webhooks/test')
        .send({})
        .expect(200);

      expect(response.headers['x-ratelimit-remaining']).toBe('9');
    });
  });

  describe('Time Window Behavior', () => {
    test('should reset rate limit after time window expires', async () => {
      // Create app with very short window for testing (100ms)
      const shortWindowApp = express();
      shortWindowApp.use(express.json());
      shortWindowApp.use('/webhooks', rateLimiter({
        windowMs: 100, // 100ms window
        max: 2
      }));
      shortWindowApp.post('/webhooks/test', (req, res) => {
        res.json({ success: true });
      });

      // Make 2 requests (hit limit)
      await request(shortWindowApp).post('/webhooks/test').send({}).expect(200);
      await request(shortWindowApp).post('/webhooks/test').send({}).expect(200);

      // 3rd request should be blocked
      await request(shortWindowApp).post('/webhooks/test').send({}).expect(429);

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should work again after window reset
      const response = await request(shortWindowApp)
        .post('/webhooks/test')
        .send({})
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.headers['x-ratelimit-remaining']).toBe('1');
    });

    test('should include Retry-After header when rate limited', async () => {
      // Hit the rate limit
      for (let i = 0; i < 10; i++) {
        await request(app).post('/webhooks/test').send({}).expect(200);
      }

      // Next request should be blocked with Retry-After header
      const response = await request(app)
        .post('/webhooks/test')
        .send({})
        .expect(429);

      expect(response.headers['retry-after']).toBeDefined();
      // Retry-After should be a number (seconds to wait)
      expect(parseInt(response.headers['retry-after'])).toBeGreaterThan(0);
      expect(parseInt(response.headers['retry-after'])).toBeLessThanOrEqual(60);
    });
  });

  describe('Different Endpoints with Different Limits', () => {
    test('should support different rate limits for different endpoints', async () => {
      const multiLimitApp = express();
      multiLimitApp.use(express.json());

      // Strict limit for transactions (5 per minute)
      multiLimitApp.use('/webhooks/transactions', rateLimiter({
        windowMs: 60 * 1000,
        max: 5
      }));

      // More lenient limit for settlements (20 per minute)
      multiLimitApp.use('/webhooks/settlements', rateLimiter({
        windowMs: 60 * 1000,
        max: 20
      }));

      multiLimitApp.post('/webhooks/transactions', (req, res) => {
        res.json({ success: true });
      });

      multiLimitApp.post('/webhooks/settlements', (req, res) => {
        res.json({ success: true });
      });

      // Make 5 transaction requests (should hit limit)
      for (let i = 0; i < 5; i++) {
        await request(multiLimitApp)
          .post('/webhooks/transactions')
          .send({})
          .expect(200);
      }

      // 6th transaction should fail
      await request(multiLimitApp)
        .post('/webhooks/transactions')
        .send({})
        .expect(429);

      // But settlements endpoint should still work (different limit)
      const response = await request(multiLimitApp)
        .post('/webhooks/settlements')
        .send({})
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.headers['x-ratelimit-remaining']).toBe('19');
    });
  });

  describe('Custom Error Responses', () => {
    test('should return custom error message when configured', async () => {
      const customApp = express();
      customApp.use(express.json());
      customApp.use('/webhooks', rateLimiter({
        windowMs: 60 * 1000,
        max: 2,
        message: 'Custom rate limit message'
      }));
      customApp.post('/webhooks/test', (req, res) => {
        res.json({ success: true });
      });

      // Hit the limit
      await request(customApp).post('/webhooks/test').send({}).expect(200);
      await request(customApp).post('/webhooks/test').send({}).expect(200);

      // Should get custom message
      const response = await request(customApp)
        .post('/webhooks/test')
        .send({})
        .expect(429);

      expect(response.body.error).toBe('Custom rate limit message');
    });

    test('should return standardized JSON error format', async () => {
      // Hit the limit
      for (let i = 0; i < 10; i++) {
        await request(app).post('/webhooks/test').send({}).expect(200);
      }

      const response = await request(app)
        .post('/webhooks/test')
        .send({})
        .expect(429);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBeTruthy();
      expect(response.headers['content-type']).toMatch(/json/);
    });
  });

  describe('Edge Cases', () => {
    test('should handle concurrent requests correctly', async () => {
      // Make 15 concurrent requests
      const promises = [];
      for (let i = 0; i < 15; i++) {
        promises.push(
          request(app)
            .post('/webhooks/test')
            .send({ test: i })
        );
      }

      const responses = await Promise.all(promises);

      // Count successful vs rate-limited
      const successful = responses.filter(r => r.status === 200).length;
      const rateLimited = responses.filter(r => r.status === 429).length;

      // Should have exactly 10 successful and 5 blocked
      expect(successful).toBe(10);
      expect(rateLimited).toBe(5);
    });

    test('should not rate limit other routes', async () => {
      const mixedApp = express();
      mixedApp.use(express.json());

      // Only apply rate limiter to /webhooks
      mixedApp.use('/webhooks', rateLimiter({
        windowMs: 60 * 1000,
        max: 2
      }));

      mixedApp.post('/webhooks/test', (req, res) => {
        res.json({ success: true });
      });

      mixedApp.post('/public/test', (req, res) => {
        res.json({ success: true });
      });

      // Hit webhook limit
      await request(mixedApp).post('/webhooks/test').send({}).expect(200);
      await request(mixedApp).post('/webhooks/test').send({}).expect(200);
      await request(mixedApp).post('/webhooks/test').send({}).expect(429);

      // Public route should not be affected
      for (let i = 0; i < 5; i++) {
        const response = await request(mixedApp)
          .post('/public/test')
          .send({})
          .expect(200);
        expect(response.body.success).toBe(true);
      }
    });

    test('should handle malformed IP addresses gracefully', async () => {
      const response = await request(app)
        .post('/webhooks/test')
        .set('X-Forwarded-For', 'not-a-valid-ip')
        .send({})
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });
});
