const crypto = require('crypto');

/**
 * Webhook Signature Verification Middleware
 *
 * Verifies that webhook requests are authentic using HMAC-SHA256 signatures.
 * This prevents unauthorized parties from sending fake webhook requests.
 *
 * Security features:
 * - HMAC-SHA256 signature verification
 * - Timestamp validation to prevent replay attacks (5 minute window)
 * - Constant-time comparison to prevent timing attacks
 *
 * Headers expected:
 * - X-Webhook-Signature: The HMAC-SHA256 signature
 * - X-Webhook-Timestamp: Unix timestamp when webhook was sent
 *
 * Signature format:
 * HMAC-SHA256(timestamp + "." + JSON_payload, secret)
 */

const TIMESTAMP_TOLERANCE = 300; // 5 minutes in seconds

function verifyWebhookSignature(req, res, next) {
  try {
    // 1. Check if webhook secret is configured
    const webhookSecret = process.env.WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('WEBHOOK_SECRET environment variable not set');
      return res.status(500).json({
        error: 'Webhook secret not configured'
      });
    }

    // 2. Extract signature and timestamp from headers
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];

    if (!signature) {
      return res.status(401).json({
        error: 'Missing signature header (X-Webhook-Signature)'
      });
    }

    if (!timestamp) {
      return res.status(401).json({
        error: 'Missing timestamp header (X-Webhook-Timestamp)'
      });
    }

    // 3. Validate timestamp format
    const timestampNum = parseInt(timestamp, 10);
    if (isNaN(timestampNum)) {
      return res.status(401).json({
        error: 'Invalid timestamp format'
      });
    }

    // 4. Check if timestamp is within acceptable range (prevent replay attacks)
    const currentTime = Math.floor(Date.now() / 1000);
    const timeDiff = Math.abs(currentTime - timestampNum);

    if (timeDiff > TIMESTAMP_TOLERANCE) {
      return res.status(401).json({
        error: `Request timestamp too old or in future. Time difference: ${timeDiff}s (max: ${TIMESTAMP_TOLERANCE}s)`
      });
    }

    // 5. Compute expected signature
    const payloadString = JSON.stringify(req.body);
    const signedPayload = `${timestamp}.${payloadString}`;
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(signedPayload)
      .digest('hex');

    // 6. Compare signatures using constant-time comparison (prevents timing attacks)
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature, 'utf8'),
      Buffer.from(expectedSignature, 'utf8')
    );

    if (!isValid) {
      console.warn(`Invalid webhook signature from IP: ${req.ip}`);
      return res.status(401).json({
        error: 'Invalid signature'
      });
    }

    // 7. Signature is valid, proceed to next middleware
    next();

  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return res.status(500).json({
      error: 'Error verifying webhook signature'
    });
  }
}

module.exports = verifyWebhookSignature;
