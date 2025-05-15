import NodeCache from 'node-cache';
import { checkUrl } from './domain_checker';

/**
 * This module provides functionality for checking URLs against security threats
 * It uses a caching mechanism to improve performance for repeated checks
 * and implements the Singleton pattern to ensure a single instance is used throughout the application
 */

/**
 * Represents a detected threat for a URL
 */
export interface UrlCheckerThreat {
    url: string;       // The URL that contains a threat
    threat: string;    // Description of the threat
    parentUrl: string; // The source URL where this URL was found
}

/**
 * Contains the results of URL security checks
 */
export interface UrlCheckerResult {
    threats: UrlCheckerThreat[]; // URLs that contain threats
    safe: string[];              // URLs that are considered safe
}

// Cache URL check results to avoid redundant checks
const cache = new NodeCache({ stdTTL: 3600 }); // Cache with a TTL of 1 hour

/**
 * Handles URL security checks with caching for performance
 * Implemented as a Singleton to ensure consistent caching across the application
 */
export class UrlChecker {
    private static instance: UrlChecker;

    /**
     * Private constructor to prevent direct instantiation
     * Use getInstance() instead
     */
    private constructor() {
        // Private constructor for Singleton pattern
    }

    /**
     * Returns the singleton instance of UrlChecker
     * Creates the instance if it doesn't exist yet
     */
    public static getInstance(): UrlChecker {
        if (!UrlChecker.instance) {
            UrlChecker.instance = new UrlChecker();
        }
        return UrlChecker.instance;
    }

    /**
     * Checks a list of URLs for security threats
     * Uses caching to improve performance for repeated checks
     * @param urls The list of URLs to check
     * @param parentUrl The URL from which the checked URLs were found
     * @returns A Promise containing the check results with threats and safe URLs
     */
    public async checkUrls(urls: string[], parentUrl: string): Promise<UrlCheckerResult> {
        this.log(`Checking ${urls.length} URLs from ${parentUrl}...`);
        const result: UrlCheckerResult = {
            threats: [],
            safe: [],
        };


        const checkPromises = urls.map(async (url) => {
            // Check if the URL is already in the cache to avoid redundant checks
            if (cache.has(url)) {
                const cachedThreat = cache.get<string | undefined>(url);
                if (cachedThreat) {
                    result.threats.push({ url, threat: cachedThreat, parentUrl });
                } else {
                    result.safe.push(url);
                }
                return;
            }

            // Perform security check for URLs not in cache
            const threat = await checkUrl(url);
            if (threat) {
                result.threats.push({ url, threat, parentUrl });
                cache.set(url, threat);
            } else {
                result.safe.push(url);
                cache.set(url, undefined);
            }
        });

        await Promise.all(checkPromises);
        this.log(`Finished checking ${urls.length} URLs from ${parentUrl}.`);
        return result;
    }

    /**
     * Logs messages with the UrlChecker prefix
     * @param message The message to log
     */
    private log(message: string): void {
        console.log(`[UrlChecker] ${message}`);
    }
}
