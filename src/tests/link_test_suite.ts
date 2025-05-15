import { EmlData } from "../mails/eml_parser";
import { UrlChecker } from "../url/url_checker";
import { UrlCrawler } from "../url/url_crawler";

/**
 * Result structure for link security tests
 * Contains a list of URL checks with their results
 */
export interface LinkTestSuiteResult {
    checks: UrlCheck[];
}

/**
 * Test suite for analyzing links in emails for security issues
 * Crawls URLs, follows redirects, and checks for malicious content
 */
export class LinkTestSuite {
    /**
     * Runs security tests on all links found in the email
     * @param input The email data as a Buffer or EmlData object
     * @returns Test results and information for LLM analysis
     */
    public async runTests(input: Buffer | EmlData): Promise<{ report: LinkTestSuiteResult, llmInfo: string }> {
        const result: LinkTestSuiteResult = {
            checks: [],
        };

        let eml = input instanceof Buffer ? await EmlData.fromBuffer(input) : input as EmlData;
        if (!eml) {
            result.checks.push({
                title: 'Dateifehler',
                passed: false,
                message: 'Die EML-Datei konnte nicht korrekt gelesen werden.',
            });
            return { report: result, llmInfo: '' };
        }

        // Extract all unique URLs from anchor tags
        const anchors = eml.body.getAnchorData();
        const urls = [...new Set(anchors.map(anchor => anchor.url))];
        
        // Convert mailto: links to https:// domain links and filter non-http(s) URLs
        const urlsConverted = urls.map(url => {
            if (url.startsWith('mailto:')) {
                const email = url.substring(7);
                const domain = email.split('@')[1];
                return `https://${domain}`;
            }
            return url;
        });
        const urlsFiltered = urlsConverted.filter(url => url.startsWith('http://') || url.startsWith('https://'));
        const crawler = UrlCrawler.getInstance();
        const checker = UrlChecker.getInstance();

        console.log(`Found ${anchors.length} links in email.`);

        let llmInfo = '';
        const results = await Promise.all(urlsFiltered.map(async (url) => {
            const urlObj = new URL(url);
            const truncatedQuery = urlObj.search.length > 30 ? urlObj.search.substring(0, 30) + '...' : urlObj.search;
            const truncatedUrl = `${urlObj.origin}${urlObj.pathname}${truncatedQuery}`;
            if (crawler.whitelist.check(url)) {
                return {
                    urlInfo: '',
                    parentCheck: {
                        title: `Überprüfen von ${truncatedUrl}`,
                        message: 'URL auf Whitelist gefunden',
                        passed: true,
                    },
                };
            }

            let passed = true;
            let nestedChecks: UrlCheck[] = [];
            let { redirects, foundUrls, meta, screenshotUuid } = await crawler.crawl(url);
            let urlInfo = '-----------------------------------\n';
            urlInfo += `URL: ${url}\n`;
            urlInfo += `1. Redirects:\n`;
            // Extract unique redirect hostnames in the correct order
            const uniqueRedirectHostnames = [...new Set(redirects.map(redirect => new URL(redirect).hostname))];
            urlInfo += `  ${redirects.length} redirects to ${uniqueRedirectHostnames.length} unique hostnames\n`;
            urlInfo += `  ${uniqueRedirectHostnames.map(hostname => hostname).join(' -> ')}\n`;
            urlInfo += `2. Meta Description:\n`;
            urlInfo += `  ${meta}\n`;

            // Check all redirect URLs against security blacklists
            let { threats: threatsRedirected } = await checker.checkUrls(redirects, url);
            if (threatsRedirected.length !== 0) {
                passed = false;
            }
            if (redirects.length > 0) {
                nestedChecks.push({
                    title: `${redirects.length} Weiterleitungen geprüft`,
                    passed: threatsRedirected.length === 0,
                    message: threatsRedirected.map(threat => ({
                        title: `Gefunden: ${threat.url}`,
                        passed: false,
                        points: -1,
                        message: threat.threat,
                    })),
                });
                const lastUrl = new URL(redirects[redirects.length - 1]);
                nestedChecks.push({
                    title: `Ziel: ${lastUrl.origin}${lastUrl.pathname}`,
                    passed: true,
                    message: [],
                });
            }
            // Check all URLs found on the final page against security blacklists
            let { threats: threatsUrl } = await checker.checkUrls(foundUrls, url);
            if (threatsUrl.length !== 0) {
                passed = false;
            }
            if (foundUrls.length > 0) {
                nestedChecks.push({
                    title: `${foundUrls.length} Links auf der Seite geprüft`,
                    passed: threatsUrl.length === 0,
                    message: threatsUrl.map(threat => ({
                        title: `Gefunden: ${threat.url}`,
                        passed: false,
                        points: -1,
                        message: threat.threat,
                    })),
                });
            }
            const parentCheck: UrlCheck = {
                title: `Überprüfen von ${truncatedUrl}`,
                passed: passed,
                message: nestedChecks,
                screenshot: screenshotUuid,
            };
            return { parentCheck, urlInfo };
        }));

        results.forEach(({ parentCheck, urlInfo }) => {
            result.checks.push(parentCheck);
            llmInfo += urlInfo;
        });
        return { report: result, llmInfo };
    }
}

export interface UrlCheck {
    title: string;
    passed: boolean;
    message: string | UrlCheck[];
    screenshot?: string;
}
