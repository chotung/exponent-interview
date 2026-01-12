/**
 * Rate Limiting Middleware
 *
 * Protects against DDoS attacks and API abuse by limiting the number of requests
 * per IP address within a time window.
 *
 * Features:
 * - IP-based rate limiting
 * - Configurable time windows and request limits
 * - Standard rate limit headers (X-RateLimit-*)
 * - Retry-After header when rate limited
 *
 * For production: Replace in-memory store with Redis for distributed rate limiting
 * across multiple servers.
 *
 * Usage:
 * app.use('/api', rateLimiter({ windowMs: 60000, max: 100 }));
 */

class RateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60 * 1000; // Default: 1 minute
    this.max = options.max || 100; // Default: 100 requests per window
    this.message = options.message || 'Too many requests, please try again later';

    // In-memory store: Map<IP, { count: number, resetTime: number }>
    // For production, use Redis: https://www.npmjs.com/package/rate-limit-redis
    this.store = new Map();

    // Clean up old entries every minute to prevent memory leaks
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 1000);
  }

  /**
   * Get client IP address from request
   * Checks X-Forwarded-For header first (for proxies/load balancers)
   */
  getClientIP(req) {
    return (
      req.headers['x-forwarded-for']?.split(',')[0].trim() ||
      req.ip ||
      req.connection?.remoteAddress ||
      'unknown'
    );
  }

  /**
   * Get or create rate limit entry for IP
   */
  getEntry(ip) {
    const now = Date.now();
    let entry = this.store.get(ip);

    // If no entry or entry expired, create new one
    if (!entry || now > entry.resetTime) {
      entry = {
        count: 0,
        resetTime: now + this.windowMs
      };
      this.store.set(ip, entry);
    }

    return entry;
  }

  /**
   * Clean up expired entries to prevent memory leaks
   */
  cleanup() {
    const now = Date.now();
    for (const [ip, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(ip);
      }
    }
  }

  /**
   * Middleware function
   */
  middleware() {
    return (req, res, next) => {
      const ip = this.getClientIP(req);
      const entry = this.getEntry(ip);

      // Increment request count
      entry.count++;

      // Calculate remaining requests
      const remaining = Math.max(0, this.max - entry.count);
      const resetTime = Math.ceil(entry.resetTime / 1000); // Unix timestamp in seconds

      // Set standard rate limit headers
      res.setHeader('X-RateLimit-Limit', this.max.toString());
      res.setHeader('X-RateLimit-Remaining', remaining.toString());
      res.setHeader('X-RateLimit-Reset', resetTime.toString());

      // Check if rate limit exceeded
      if (entry.count > this.max) {
        const retryAfter = Math.ceil((entry.resetTime - Date.now()) / 1000);
        res.setHeader('Retry-After', retryAfter.toString());

        return res.status(429).json({
          error: this.message,
          retryAfter: retryAfter
        });
      }

      // Request is within limit, proceed
      next();
    };
  }

  /**
   * Stop cleanup interval (for graceful shutdown)
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Clear all rate limit data (for testing)
   */
  reset() {
    this.store.clear();
  }
}

/**
 * Factory function to create rate limiter middleware
 *
 * @param {Object} options - Configuration options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Maximum requests per window
 * @param {string} options.message - Error message when rate limited
 * @returns {Function} Express middleware function
 */
function rateLimiter(options) {
  const limiter = new RateLimiter(options);
  return limiter.middleware();
}

// Export both the factory function and the class
module.exports = rateLimiter;
module.exports.RateLimiter = RateLimiter;
