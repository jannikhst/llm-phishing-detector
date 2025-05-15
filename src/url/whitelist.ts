import fs from "fs/promises";

/**
 * This module provides functionality for checking URLs against a whitelist
 * It allows loading trusted domains from a file and checking if URLs belong to those domains
 * while also checking for potentially malicious redirect parameters
 */

/**
 * Manages a whitelist of trusted domains and provides methods to check URLs against it
 */
export class WhitelistChecker {
    private whitelist: Set<string>;

    /**
     * Creates a new whitelist checker with an empty whitelist
     */
    constructor() {
        this.whitelist = new Set();
    }

    /**
     * Loads the whitelist from a file, ignoring comments and empty lines
     * @param filePath Path to the whitelist file
     */
    async loadWhitelist(filePath: string) {
        const fileContent = await fs.readFile(filePath, "utf-8");
        const lines = fileContent.split("\n");
        lines.forEach((line) => {
            const trimmedLine = line.trim();
            if (trimmedLine && !trimmedLine.startsWith("#")) {
                this.whitelist.add(trimmedLine);
            }
        });
    }

    /**
     * Checks if a URL is on the whitelist and doesn't contain suspicious parameters
     * @param inputUrl The URL to check
     * @returns True if the URL is considered safe, false otherwise
     */
    public check(inputUrl: string): boolean {
        try {
            let formattedUrl = inputUrl.startsWith("http") ? inputUrl : `http://${inputUrl}`;
            const parsedUrl = new URL(formattedUrl);
            const domain = parsedUrl.hostname;

            // Check if the domain or its www subdomain is in the whitelist
            if (this.whitelist.has(domain) || this.whitelist.has(`www.${domain}`)) {
                // Check for suspicious redirect parameters that might be used for phishing
                const params = parsedUrl.searchParams;
                for (const param of params.keys()) {
                    if (param.toLowerCase().includes("redirect") || param.toLowerCase().includes("url") || param.toLowerCase().includes("return")) {
                        return false;
                    }
                }
                return true;
            }
            return false;
        } catch (error) {
            return false;
        }
    }
}
