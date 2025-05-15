import { AddressObject, ParsedMail, simpleParser } from 'mailparser';
import { inspect } from 'util';
import fs from 'fs/promises';
import { scanBufferForMalware } from '../utils/malware';
import { 
    checkIpAgainstDNSBL, 
    detectSpoofing, 
    isValidEml, 
    resolveIPAddress, 
    verifyDkim 
} from './verify';
import * as cheerio from 'cheerio';

/**
 * Represents an email message parsed from an EML file
 * Provides methods to access email properties and perform security checks
 */
export class EmlData {
    private email: ParsedMail;
    private rawEmail: Buffer;

    private constructor(parsedEmail: ParsedMail, rawEmail: Buffer) {
        this.email = parsedEmail;
        this.rawEmail = rawEmail;
    }

    /**
     * Reads an EML file from the file system and returns an instance of EmlData
     * @param filePath The path to the EML file
     * @returns An instance of EmlData or undefined if the file is not a valid EML file
     */
    static async fromFile(filePath: string): Promise<EmlData | undefined> {
        try {
            const buffer = await fs.readFile(filePath);
            return await EmlData.fromBuffer(buffer);
        } catch (error) {
            console.error('Error reading file:', error);
            return undefined;
        }
    }

    /**
     * Parses an EML file from a buffer and returns an instance of EmlData
     * @param buffer The buffer containing the EML file content
     * @returns An instance of EmlData or undefined if the buffer does not contain a valid EML file
     */
    static async fromBuffer(buffer: Buffer): Promise<EmlData | undefined> {
        if (await isValidEml(buffer)) {
            const parsedEmail = await simpleParser(buffer);
            return new EmlData(parsedEmail, buffer);
        }
        console.error('Invalid EML file');
        return undefined;
    }

    /**
     * Gets the email sender's address
     * @returns The email's sender address
     */
    get senderAddress(): string {
        const senderInfo = this.email.from!;
        const value = senderInfo.value;
        return value[0].address!;
    }

    /**
     * Gets the display name of the email sender
     * @returns The name of the sender of the email
     */
    get senderName(): string {
        const senderInfo = this.email.from!;
        const value = senderInfo.value;
        return value[0].name;
    }

    /**
     * Gets the email subject
     * @returns The subject of the email
     */
    get subject(): string {
        return this.email.subject || '';
    }

    /**
     * Gets the Reply-To address if present
     * @returns The Reply-To address or undefined if not present
     */
    get replyTo(): string | undefined {
        const replyTo = this.email.headers.get('reply-to');
        if (replyTo) {
            const header = replyTo as AddressObject;
            const value = header.value;
            return value[0].address;
        }
    }

    /**
     * Gets the Return-Path header value
     * @returns The email's return path header or undefined if not present
     */
    get returnPath(): string | undefined {
        const returnPath = this.email.headers.get('return-path');
        if (returnPath) {
            try {
                console.log('return path:', returnPath);
                const header = returnPath as AddressObject;
                const value = header.value;
                return value[0].address;
            } catch (error) {
                console.error('Error parsing Return-Path header:', returnPath, error);
            }
        }
    }

    /**
     * Gets the cleaned Received headers by filtering out local server entries
     * @returns Array of relevant Received header lines
     */
    private get _cleanedReceivedHeader(): string[] {
        const received = this.email.headers.get('received');
        try {
            if (received) {
                const lines = received as string[];
                // Filter out local server entries that aren't relevant for analysis
                const rm = [
                    'from ' + process.env.MAIL_SERVER,
                    'from localhost',
                    'by',
                ];
                return lines.filter(line => !rm.some(r => line.startsWith(r)));
            }
            return [];
        } catch (error) {
            console.log('received header:', typeof received);
            console.error('Error parsing Received header:', received, error);
            return [];
        }
    }


    /**
     * Extracts the IP address of the server that delivered the email
     * @returns The IP address of the server that delivered the email or undefined if not found
     */
    get senderServerIP(): string | undefined {
        const filtered = this._cleanedReceivedHeader;
        if (filtered.length === 0) {
            return undefined;
        }
        const ipRegex = /\[(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\]/;
        const matchLine = filtered.find(line => {
            return line.match(ipRegex) !== null;
        });
        const match = matchLine?.match(ipRegex);
        if (match) {
            return match[1];
        }
    }

    /**
     * Extracts the hostname of the server that delivered the email
     * @returns The hostname of the server that delivered the email or undefined if not found
     */
    get senderMailserverHostname(): string | undefined {
        const filtered = this._cleanedReceivedHeader
        if (filtered.length === 0) {
            return undefined;
        }
        const heloRegex = /from\s+(\S+)\s+\(.*\[(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\]/;
        const matchLine = filtered.find(line => {
            return line.match(heloRegex) !== null;
        });
        const match = matchLine?.match(heloRegex);
        if (match) {
            return match[1];
        }
    }

    /**
     * Checks the attachments of the email for nested EML files (not recursive)
     * @returns An array of EmlData instances representing the nested EML files
     */
    async findNestedEmlFiles(): Promise<EmlData[]> {
        const attachments = this.email.attachments;
        const nestedEmls = attachments.filter(att => att.contentType === 'message/rfc822');
        const nestedEmlFiles = await Promise.all(nestedEmls.map(att => EmlData.fromBuffer(att.content)));
        return nestedEmlFiles.filter((eml): eml is EmlData => !!eml);
    }

    /**
     * Scans the email's attachments for malware
     * @returns An array of objects containing the filename, viruses found, and checksum of each attachment
     */
    async scanAttachmentsForMalware(): Promise<{ fileName: string, viruses: string[], checksum: string }[]> {
        const attachments = this.email.attachments;
        const results = await Promise.all(attachments.map(async att => {
            const viruses = await scanBufferForMalware(att.content);
            return { fileName: att.filename || 'unnamed', viruses, checksum: att.checksum };
        }));
        return results;
    }

    /**
     * Verifies that the email has a valid DKIM signature
     * @returns A boolean indicating whether the DKIM signature is valid
     */
    async isDkimValid(): Promise<boolean> {
        return await verifyDkim(this.rawEmail);
    }

    /**
     * Checks if the email is potentially spoofed by analyzing headers and sender information
     * @returns A boolean indicating whether the email is likely spoofed
     */
    async spoofingDetected(): Promise<boolean> {
        const helo = this.senderMailserverHostname;
        if (!helo) {
            console.error('No HELO found in Received header.');
            return true;
        }
        const ip = (await resolveIPAddress(helo!)) || this.senderServerIP;
        if (!ip) {
            console.error('No IP found in Received header.');
            return true;
        }

        // check if IP is on blacklist
        if (await checkIpAgainstDNSBL(ip)) {
            console.warn(`IP address ${ip} is on a DNSBL.`);
            return true;
        }
        return await detectSpoofing(this.rawEmail, ip, helo, this.senderAddress);
    }

    toString(): string {
        return inspect(this.email);
    }

    toHeaderString(): string {
        return inspect(this.email.headerLines);
    }

    get body(): EmlBody {
        return new EmlBody(this.email, this);
    }
}


/**
 * Represents the body content of an email with methods to extract and analyze its content
 */
export class EmlBody {
    private email: ParsedMail;
    private parent: EmlData;

    constructor(email: ParsedMail, parent: EmlData) {
        this.email = email;
        this.parent = parent;
    }

    /**
     * Extracts all URLs found in the email's body from both text and HTML content
     * @returns Array of unique URLs found in the email
     */
    get allUrls(): string[] {
        const body = this.email.text || this.email.html || '';
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urls = body.match(urlRegex) || [];
        return [...new Set([...this.getAnchorData().map(a => a.url), ...urls])];
    }


    /**
     * Extracts all HTML <a> tags from the email body and returns their text and URLs
     * @returns An array of objects containing the anchor text and URL of each link
     */
    getAnchorData(): { text: string; url: string }[] {
        const result: { text: string; url: string }[] = [];
        const html = this.email.html || '';

        // Laden des HTML-Inhalts mit Cheerio
        const $ = cheerio.load(html);

        // Iterieren über alle <a>-Tags im HTML
        $('a').each((_, element) => {
            const href = $(element).attr('href')?.trim() || '';
            const anchorText = $(element).text().trim();

            // Nur Links mit einem href-Attribut hinzufügen
            if (href) {
                result.push({ text: anchorText, url: href });
            }
        });

        return result;
    }

    /**
     * Gets the email body content as text
     * @returns The email body as HTML or plain text
     */
    getText(): string {
        return this.email.html || this.email.text || '';
    }

    /**
     * Gets a sanitized version of the HTML email body with potentially dangerous attributes removed
     * @returns Cleaned HTML content with only allowed attributes preserved
     */
    getStrippedHtml(): string {
        const html = this.email.html || '';
        if (!html) {
            return '';
        }

        // Load the HTML content with Cheerio for DOM manipulation
        const $ = cheerio.load(html);

        // Remove all HTML comments for security
        $('*')
            .contents()
            .each(function () {
                if (this.type === 'comment') {
                    $(this).remove();
                }
            });

        // Define the attributes to keep (whitelist approach for security)
        const allowedAttributes = ['href', 'target', 'rel', 'title', 'alt'];

        // Remove all attributes except the explicitly allowed ones
        $('*').each((_, element) => {
            if (element.type === 'tag') {
                const attributes = Object.keys(element.attribs || {});
                attributes.forEach(attr => {
                    if (!allowedAttributes.includes(attr)) {
                        $(element).removeAttr(attr);
                    }
                });
            }
        });

        // Remove unnecessary whitespace for cleaner output
        const cleanedHtml = $('body').html()?.replace(/\s+/g, ' ').trim() || '';

        return cleanedHtml;
    }
}
