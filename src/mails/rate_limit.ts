import NodeCache from 'node-cache';
import { createHash } from 'crypto';

/**
 * Manages rate limiting for email processing to prevent abuse
 * Tracks email usage by sender address (hashed for privacy)
 * and enforces daily limits with whitelist exceptions
 */
export class EmailRateLimiter {
    private cache: NodeCache;
    private whitelist: Set<string>;
    private dailyLimit: number;

    /**
     * Creates a new rate limiter instance
     * @param dailyLimit Maximum number of emails allowed per day per sender (default: 3)
     * @param cacheTtl Time-to-live for cache entries in seconds (default: 86400 = 24 hours)
     */
    constructor(dailyLimit = 3, cacheTtl = 86400) {
        this.cache = new NodeCache({ stdTTL: cacheTtl, checkperiod: 3600 });
        this.whitelist = new Set();
        this.dailyLimit = dailyLimit;
    }

    /**
     * Creates a hash for the given email address for privacy-preserving tracking
     * @param email The email address to hash
     * @returns SHA256 hash of the email address (lowercase)
     */
    private hashEmail(email: string): string {
        return createHash('sha256').update(email.toLowerCase()).digest('hex');
    }

    /**
     * Adds a user to the whitelist based on their email address
     * Whitelisted users bypass rate limiting
     * @param emailAddress The user's email address
     */
    addToWhitelist(emailAddress: string): void {
        const hashed = this.hashEmail(emailAddress);
        this.whitelist.add(hashed);
    }

    /**
     * Removes a user from the whitelist
     * @param emailAddress The user's email address
     */
    removeFromWhitelist(emailAddress: string): void {
        const hashed = this.hashEmail(emailAddress);
        this.whitelist.delete(hashed);
    }

    /**
     * Checks if a user is on the whitelist
     * @param emailAddress The user's email address
     * @returns True if the user is whitelisted, false otherwise
     */
    isWhitelisted(emailAddress: string): boolean {
        const hashed = this.hashEmail(emailAddress);
        return this.whitelist.has(hashed);
    }

    /**
     * Processes an incoming email and applies rate limiting rules
     * Only stores hashed email addresses for privacy
     * @param email The email object with sender information
     * @returns True if the rate limit has been exceeded, false otherwise
     */
    isExceeded(email: { senderAddress: string }): boolean {
        const hashedSender = this.hashEmail(email.senderAddress);

        // Skip rate limiting for whitelisted users
        if (this.isWhitelisted(email.senderAddress)) {
            return false;
        }

        // Get the current count for this sender
        let count = this.cache.get<number>(hashedSender) || 0;

        // Check if rate limit is exceeded
        if (count >= this.dailyLimit) {
            return true;
        }

        // Increment the counter
        this.cache.set(hashedSender, count + 1);
        return false;
    }

    /**
     * Resets rate limits for all users
     * Primarily used for debugging or special cases
     */
    resetAllLimits(): void {
        this.cache.flushAll();
    }
}
