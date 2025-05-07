import { Browser, Page, HTTPResponse } from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import Stealth from 'puppeteer-extra-plugin-stealth';
import Anon from 'puppeteer-extra-plugin-anonymize-ua';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid'; // For generating unique identifiers
import { WhitelistChecker } from './whitelist';
import { ScreenshotController } from '../utils/screenshot_manager';

/**
 * This module provides functionality for crawling URLs to extract information
 * It uses Puppeteer to visit websites, follow redirects, extract links,
 * capture screenshots, and analyze content for security analysis
 */

/**
 * Simple semaphore implementation to limit concurrent crawls
 * Prevents overloading the system with too many browser instances
 */
class Semaphore {
    private tasks: Array<() => void> = [];
    private counter: number;
    private lastFullTimestamp: number | null = null;

    constructor(private maxConcurrency: number) {
        this.counter = maxConcurrency;
        this.lastFullTimestamp = Date.now();
    }

    get remaining() {
        return this.counter;
    }

    /**
     * Checks if the semaphore has been unused (full) for at least the specified duration
     * Used to determine when to close idle browser instances to free resources
     * @param duration Time in milliseconds
     * @returns True if the semaphore has been at full capacity for at least the specified duration
     */
    public isUnusedFor(duration: number): boolean {
        if (this.counter === this.maxConcurrency) {
            const now = Date.now();
            return (now - (this.lastFullTimestamp || now)) >= duration;
        }
        return false;
    }

    public async acquire(): Promise<() => void> {
        return new Promise<() => void>((resolve) => {
            const tryAcquire = () => {
                if (this.counter > 0) {
                    this.counter--;
                    if (this.counter === 0) {
                        this.lastFullTimestamp = null;
                    }
                    console.log(`Semaphore acquired, remaining: ${this.counter}`);
                    resolve(this.release.bind(this));
                } else {
                    this.tasks.push(tryAcquire);
                }
            };
            tryAcquire();
        });
    }

    private release() {
        this.counter++;
        console.log(`Semaphore released, remaining: ${this.counter}`);
        if (this.counter === this.maxConcurrency) {
            this.lastFullTimestamp = Date.now();
        }
        if (this.tasks.length > 0) {
            const nextTask = this.tasks.shift();
            if (nextTask) nextTask();
        }
    }
}

/**
 * Contains the results of a URL crawling operation
 */
export interface UrlCrawlerResult {
    redirects: string[];      // Chain of redirects followed
    foundUrls: string[];      // URLs found on the page
    meta: string | undefined; // Meta description of the page
    strippedHtml: string;     // Sanitized HTML content
    fullText: string;         // Full text content of the page
    screenshotUuid?: string;  // UUID of the screenshot if one was taken
}

export class UrlCrawler {
    private browser: Browser | null = null;
    private static instance: UrlCrawler;
    private semaphore: Semaphore;
    whitelist: WhitelistChecker;
    private screenshotDir = path.resolve(__dirname, '../data/tmp/screenshots');
    private screenshotManager: ScreenshotController = new ScreenshotController(path.resolve(this.screenshotDir, 'screenshots.json'));

    private constructor() {
        fs.mkdir(this.screenshotDir, { recursive: true }).then(() => {
            console.log('Screenshot directory created');
            this.screenshotManager.bulkLoadScreenshots(this.screenshotDir);
        });
        this.semaphore = new Semaphore(7);
        this.whitelist = new WhitelistChecker();
        const whitelistPath = path.resolve(__dirname, '..', 'data', 'public', 'whitelist.txt');
        this.whitelist.loadWhitelist(whitelistPath);
        const checkInterval = 1000 * 60;
        // check every 5 min if the browser is in use. close otherwise to free up resources
        setInterval(() => {
            this.whitelist.loadWhitelist(whitelistPath);
            if (this.semaphore.isUnusedFor(checkInterval)) {
                if (this.browser) {
                    this.log('Closing browser due to inactivity');
                }
                this.closeBrowser();
            }
        }, checkInterval);
    }

    /**
     * Returns the singleton instance of UrlCrawler
     * Creates the instance if it doesn't exist yet
     */
    public static getInstance(): UrlCrawler {
        if (!UrlCrawler.instance) {
            UrlCrawler.instance = new UrlCrawler();
        }
        return UrlCrawler.instance;
    }

    /**
     * Initializes the Puppeteer browser with stealth and anonymization plugins
     * @param options Optional configuration for the browser
     */
    private async initializeBrowser(
        options?: {
            screenshotSize?: { height: number, width: number }
        },
    ) {
        if (this.browser) return;
        puppeteer.use(Anon());
        puppeteer.use(Stealth());
        this.browser = await puppeteer.launch({
            headless: true,
            defaultViewport: options?.screenshotSize ?? { width: 1920, height: 1080 },
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
        });
    }

    /**
     * Crawls a URL, follows redirects, extracts links, collects text and HTML, and takes a screenshot
     * The maximum number of concurrent crawls is limited by the semaphore
     * @param url The URL to crawl
     * @param options Optional configuration for the screenshot size
     * @returns A Promise containing the crawling results
     */
    public async crawl(
        url: string,
        options?: {
            screenshotSize?: { height: number, width: number }
        },
    ): Promise<UrlCrawlerResult> {
        const release = await this.semaphore.acquire();
        try {
            await this.initializeBrowser(options);
            return await this.performCrawl(url);
        } finally {
            release();
        }
    }

    /**
     * Performs the actual crawling process
     * @param url The URL to crawl
     * @returns A Promise with the crawling result
     */
    private async performCrawl(url: string): Promise<UrlCrawlerResult> {
        await this.initializeBrowser();

        if (!this.browser) {
            throw new Error('Puppeteer browser could not be initialized.');
        }

        const jsRedirects: string[] = [];

        const page: Page = await this.browser.newPage();

        page.on('framenavigated', frame => {
            if (frame === page.mainFrame()) {
                jsRedirects.push(frame.url());
            }
        });

        const result: UrlCrawlerResult = {
            redirects: [],
            foundUrls: [],
            meta: undefined,
            strippedHtml: '',
            fullText: '',
        };

        try {
            this.log(`Visiting ${url}`);
            // Visit the page and get the response
            let response: HTTPResponse | null = null;
            try {
                response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 10000 });
            } catch (error) {
                console.error(`❌ Error visiting URL: ${error}`);
            }

            if (!response) {
                console.error(`❌ No response from URL: ${url}`);
                return result;
            }

            this.log('Observe redirects');
            // Collect the redirect chain
            const redirectChain = response.request().redirectChain();
            const webRedirects = redirectChain.map(req => req.url()).concat(response.url());

            try {
                await new Promise(resolve => setTimeout(resolve, 2000));
                await page.waitForNetworkIdle({ timeout: 2000 });
            } catch (error) {
                console.error(`Timeout waiting for network idle`);
            }

            result.redirects = [...jsRedirects, ...webRedirects];

            try {
                const keywords = [
                    'akzeptieren',
                    'accept',
                    'zustimmen',
                    'erlauben',
                    'allow',
                    'agree',
                    'verstanden',
                    'got it',
                    'allow all cookies'
                ];

                // Get all buttons on the page
                const buttons = await page.$$('button');

                // Find and click the appropriate button based on keywords
                for (const button of buttons) {
                    const text = await page.evaluate((el) => el.textContent?.toLowerCase() || '', button);
                    if (keywords.some((keyword) => text.includes(keyword))) {
                        console.log('✅ Cookie consent button found:', text.trim());
                        await button.click();
                        await page.waitForNetworkIdle({ timeout: 1000 });
                        await new Promise(resolve => setTimeout(resolve, 500));
                        break;
                    }
                }
            } catch (error) {
                console.error(`Error clicking cookie consent button: ${error}`);
            }

            try {
                this.log('Take screenshot');
                const uuid = uuidv4();
                // Take a screenshot of the page
                const screenshotPath = path.join(this.screenshotDir, `${uuid}.png`);
                await Promise.race([
                    page.screenshot({ path: screenshotPath }).then(() => this.screenshotManager.addScreenshot(screenshotPath)),
                    new Promise<void>((_, reject) =>
                        setTimeout(() => reject(new Error('Screenshot timed out')), 4500),
                    )
                ]);
                result.screenshotUuid = uuid;
            } catch (error) {
                console.error(`Error creating screenshot: ${error}`);
            }

            this.log('Extract links');
            // Extract all links from the page
            const links = await page.$$eval('a[href]', (anchors) =>
                anchors.map((a) => a.href)
            );
            result.foundUrls = links.filter((link) => link.startsWith('http'));

            this.log('Extract JS URLs');
            // Extract URLs from JavaScript code
            const jsUrls = await page.$$eval('script', (scripts) => {
                const urls: string[] = [];
                scripts.forEach((script) => {
                    const matches = script.innerHTML.match(/https?:\/\/(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s'"]*)?/g);
                    if (matches) {
                        urls.push(...matches);
                    }
                });
                return urls;
            });
            result.foundUrls.push(...jsUrls);
            this.log(`Found ${result.foundUrls.length} URLs`);

            try {
                this.log('Extract meta description');
                const metaDescription = await page.$('meta[name="description"]');
                result.meta = metaDescription
                    ? (await page.evaluate(meta => meta.getAttribute('content'), metaDescription)) ?? undefined
                    : undefined;
            } catch (error) {
                console.error(`Error extracting meta description: ${error}`);
            }

            // Extract full text content from the page
            try {
                result.fullText = await page.evaluate(() => {
                    return document.body.textContent?.trim() ?? '';
                });
            } catch (error) {
                console.error(`Error extracting text content: ${error}`);
                result.fullText = '';
            }

            this.log('Crawling completed');
        } catch (error) {
            console.error(`Error crawling URL ${url}:`, error);
        } finally {
            try {
                page.close();
            } catch (error) {
                console.error(`Error closing page: ${error}`);
            }
        }
        return result;
    }

    /**
     * Helper function to generate a 9-digit alphanumeric hash from a URL
     * @param url The URL to hash
     * @returns A 9-character hash string
     */
    private generateHash(url: string): string {
        let hash = 0;
        for (let i = 0; i < url.length; i++) {
            hash = (hash * 31 + url.charCodeAt(i)) >>> 0;
        }
        return hash.toString(36).padStart(9, '0').substring(0, 9);
    }

    public async closeBrowser() {
        try {
            if (this.browser) {
                await this.browser.close();
                this.browser = null;
            }
        } catch (error) {
            console.error(`Error closing browser: ${error}`);
        }
    }

    /**
     * Logs messages with the UrlCrawler prefix
     * @param message The message to log
     */
    log(message: string) {
        console.log('UrlCrawler:', message);
    }
}
