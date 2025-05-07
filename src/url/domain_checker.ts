import axios, { AxiosError } from 'axios';
import { query } from 'dns-query';
import NodeCache from 'node-cache';
import { UrlCrawler } from './url_crawler';

// Cache with a Time-To-Live of 1 hour to avoid repeated checks for the same URL
const cache = new NodeCache({ stdTTL: 3600 });

/**
 * Checks if a domain is listed as unsafe in the Google Safe Browsing list
 * @param domain The domain or URL to check
 * @returns A string indicating the threat source, or undefined if the domain is safe
 */
async function checkDomainWithGoogleSafeBrowsing(domain: string): Promise<string | undefined> {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    try {
        new URL(domain);
    } catch {
        return undefined;
    }

    const apiKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY;
    const url = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`;

    const body = {
        client: {
            clientId: "email-security-tool",
            clientVersion: "1.0.0"
        },
        threatInfo: {
            threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
            platformTypes: ["ANY_PLATFORM"],
            threatEntryTypes: ["URL"],
            threatEntries: [{ url: domain }]
        }
    };

    try {
        const response = await axios.post(url, body, {
            headers: { 'Content-Type': 'application/json' }
        });
        return response.data.matches ? 'Google Safe Browsing' : undefined;
    } catch (error) {
        if (error instanceof AxiosError) {
            console.error('Response:', JSON.stringify(error.response?.data), error);
        } else {
            console.error('Error querying Google Safe Browsing API:', error);
        }
        return undefined;
    }
}

/**
 * Checks if a domain is listed on a Domain-based Blacklist (DBL)
 * @param domain The domain to check
 * @returns The DBL where the domain is listed, or undefined if the domain is not blacklisted
 */
async function checkDomainAgainstDBL(domain: string): Promise<string | undefined> {
    const blacklists = ['dbl.spamhaus.org', 'dbl.tornevall.org', 'multi.surbl.org'];

    /**
     * Performs a DNS query against a specific blacklist for a domain
     * @param dbl The domain blacklist to query
     * @param domain The domain to check
     * @returns True if the domain is listed on the blacklist, false otherwise
     */
    async function queryDBL(dbl: string, domain: string): Promise<boolean> {
        const dblQuery = `${domain}.${dbl}`;

        try {
            const result = await query(
                { question: { type: 'A', name: dblQuery } },
                { endpoints: ['8.8.8.8'] }
            );
            return result.rcode === 'NOERROR' && result.answers!.some(answer => answer.type === 'A');
        } catch (error) {
            console.error(`Error querying DBL ${dbl} for domain ${domain}:`, error);
            return false;
        }
    }

    for (const dbl of blacklists) {
        if (await queryDBL(dbl, domain)) {
            console.log(`Domain ${domain} is listed on DBL ${dbl}`);
            return dbl;
        }
    }
    return undefined;
}

/**
 * Checks a URL against both Google Safe Browsing and Domain-based Blacklists
 * @param url The URL to check
 * @returns A string indicating the threat source if the URL is unsafe, or undefined if it is safe
 */
export async function checkUrl(url: string): Promise<string | undefined> {
    try {
        new URL(url);
    } catch {
        return undefined;
    }

    // Check if the URL is already in cache
    if (cache.has(url)) {
        return cache.get(url) as string | undefined;
    }

    // Check against whitelist first
    if (UrlCrawler.getInstance().whitelist.check(url)) {
        cache.set(url, undefined);
        return undefined;
    }

    // Perform Google Safe Browsing and DBL checks
    const googleThreat = await checkDomainWithGoogleSafeBrowsing(url);
    if (googleThreat) {
        cache.set(url, googleThreat); // Ergebnis im Cache speichern
        return addOrigin(googleThreat, 'Google Safe Browsing');
    }
    let domain = url;
    if (url.startsWith('http')) {
        domain = new URL(url).hostname;
    }
    const dblThreat = await checkDomainAgainstDBL(domain);
    if (dblThreat) {
        cache.set(url, dblThreat); // Ergebnis im Cache speichern
        return addOrigin(dblThreat, 'Blacklisted Domain');
    }

    // If no threat was found, cache the result as safe
    cache.set(url, undefined);
    return undefined;
}

/**
 * Adds the origin of the threat detection to the threat message
 * @param string The threat message
 * @param origin The origin of the threat detection (e.g., "Google Safe Browsing")
 * @returns A formatted string combining the threat message and its origin
 */
function addOrigin(string: string, origin: string): string {
    if (string.trim().length === 0) {
        return origin;
    }
    return `${string.trim()} - ${origin}`;
}
