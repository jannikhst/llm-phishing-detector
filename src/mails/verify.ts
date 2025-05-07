import { simpleParser } from 'mailparser';
const { dkimVerify } = require('mailauth/lib/dkim/verify');
const { spf } = require('mailauth/lib/spf');
import { query } from 'dns-query';
import 'dotenv/config';

/**
 * This module provides functions for email verification and security checks
 * including DKIM signature verification, SPF record validation, IP blacklist checking,
 * and basic email format validation.
 */


/**
 * Verifies DKIM signatures for a given email
 * DKIM (DomainKeys Identified Mail) validates that the email was sent by an authorized server
 * @param email The email message as a Buffer
 * @returns True if all DKIM signatures are valid, otherwise false
 */
export async function verifyDkim(email: Buffer): Promise<boolean> {
    try {
        const result = await dkimVerify(email);
        // Check if all signatures have passed
        return result.results.every((signature: any) => {
            return signature.status.result === 'pass';
        });
    } catch (error) {
        console.error('Error during DKIM verification:', error);
        return false;
    }
}

/**
 * Checks if an email is potentially spoofed by verifying SPF records
 * SPF (Sender Policy Framework) specifies which servers are authorized to send email for a domain
 * @param email The email message as a Buffer
 * @param ip The IP address of the SMTP client
 * @param helo The hostname used in the HELO/EHLO command
 * @param sender The MAIL FROM address
 * @returns True if spoofing is suspected, otherwise false
 */
export async function detectSpoofing(email: Buffer, ip: string, helo: string, sender: string): Promise<boolean> {
    try {
        const result = await spf({
            sender,
            ip,
            helo,
            mta: process.env.MAIL_SERVER,
        });

        // Check SPF result
        const spfPass = result.status.result === 'pass';
        if (!spfPass) {
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error during spoofing detection:', error);
        return true;
    }
}



/**
 * Checks if an email is a valid EML file by verifying required headers and content
 * @param buffer The buffer containing the email (typically a .eml file)
 * @returns True if the email is a valid EML file, otherwise false
 */
export async function isValidEml(buffer: Buffer): Promise<boolean> {
    try {
        const parsedEmail = await simpleParser(buffer);

        const hasRequiredHeaders = parsedEmail.headers.has('from') &&
            parsedEmail.headers.has('date') &&
            parsedEmail.headers.has('message-id');

        const hasContent = !!(parsedEmail.text || parsedEmail.html);

        return hasRequiredHeaders && hasContent;
    } catch (error) {
        return false;
    }
}

/**
 * Resolves a hostname to its IP address, preferring IPv6 over IPv4 if available
 * @param host The hostname to resolve
 * @returns Either an IPv6 or IPv4 address, or undefined if resolution fails
 */
export async function resolveIPAddress(host: string): Promise<string | undefined> {
    /**
     * Helper function to perform DNS queries for a specific record type
     * @param type The DNS record type to query (A for IPv4, AAAA for IPv6)
     * @param host The hostname to resolve
     * @returns The resolved IP address or undefined
     */
    async function queryHelper(type: 'A' | 'AAAA', host: string) {
        try {
            const result = await query(
                { question: { type, name: host } },
                { endpoints: ['1.1.1.1'] }
            );

            if (result.rcode === 'NOERROR' && result.answers!.length > 0) {
                return (result.answers![0].data as string);
            }
        }
        catch (error) {
            console.error('Error resolving IP address:', error);
        }
    }

    const ipv6 = await queryHelper('AAAA', host);
    if (ipv6) {
        return ipv6;
    }

    const ipv4 = await queryHelper('A', host);
    if (ipv4) {
        return ipv4;
    }
}

// Cache for IP blacklist lookups to reduce redundant DNS queries
const iplookupCache = new Map<string, string>();

/**
 * Checks if an IP address (IPv4 or IPv6) is listed on a DNS-based Blacklist (DNSBL)
 * @param ip The IP address to check
 * @param blacklists An array of DNSBL domains to query (defaults to Spamhaus)
 * @returns The DNSBL where the IP is listed, or undefined if the IP is not blacklisted
 */
export async function checkIpAgainstDNSBL(ip: string, blacklists: string[] = ['zen.spamhaus.org']): Promise<string | undefined> {
    /**
     * Queries a specific DNSBL for the given IP address
     * @param dnsbl The DNSBL domain to query
     * @param formattedIp The IP address formatted for DNSBL lookup
     * @returns True if the IP is listed on the DNSBL, false otherwise
     */
    async function queryDNSBL(dnsbl: string, formattedIp: string): Promise<boolean> {
        const dnsblQuery = `${formattedIp}.${dnsbl}`;

        try {
            const result = await query(
                { question: { type: 'A', name: dnsblQuery } },
                { endpoints: ['1.1.1.1'] }
            );
            const answers: { name: string, type: string, data: string }[] = result.response.answers || [];
            // If there are answers, the IP is listed on the DNSBL
            return result.rcode === 'NOERROR' && !answers.every((answer) => answer.data.startsWith('127.255'));
        } catch (error) {
            console.error(`Error querying DNSBL ${dnsbl} for IP ${ip}:`, error);
            return false;
        }
    }

    /**
     * Formats an IPv4 address for DNSBL lookup (reverses the octets)
     * @param ip The IPv4 address to format
     * @returns The formatted address for DNSBL lookup
     */
    function formatIPv4(ip: string): string {
        return ip.split('.').reverse().join('.');
    }

    /**
     * Formats an IPv6 address for DNSBL lookup
     * @param ip The IPv6 address to format
     * @returns The formatted address for DNSBL lookup
     */
    function formatIPv6(ip: string): string {
        return ip.replace(/:/g, '')
            .split('')
            .reverse()
            .join('.');
    }

    const isIPv6 = ip.includes(':');
    const formattedIp = isIPv6 ? formatIPv6(ip) : formatIPv4(ip);

    // Check cache first to avoid redundant DNS queries
    if (iplookupCache.has(ip)) {
        return iplookupCache.get(ip);
    }

    for (const dnsbl of blacklists) {
        if (await queryDNSBL(dnsbl, formattedIp)) {
            console.log(`IP ${ip} is listed on DNSBL ${dnsbl}`);
            iplookupCache.set(ip, dnsbl);
            return dnsbl;
        }
    }
    return undefined;
}
