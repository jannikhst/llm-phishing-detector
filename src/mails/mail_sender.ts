import nodemailer, { Transporter } from 'nodemailer';
import { EmlData } from './eml_parser';
import sharp from 'sharp'; // For image processing
import { v4 as uuidv4 } from 'uuid'; // For generating unique Content-IDs
import Mail from 'nodemailer/lib/mailer';
import { LinkTestSuiteResult, UrlCheck } from '../tests/link_test_suite';
import { HtmlThreat, LlmTestSuiteResult } from '../tests/llm_test_suite';
import { TestSuiteRunner } from '../tests/test_suite_runner';

/**
 * Represents a single header security check result
 */
interface HeaderCheck {
    title: string;       // What was checked
    passed: boolean;     // Whether the check passed
    message: string;     // Message providing additional context
    severity?: 'low' | 'medium' | 'high'; // Threat severity level
}

/**
 * Represents the results of all header security checks
 */
export interface HeaderTestSuiteResult {
    checks: HeaderCheck[];
}

/**
 * Options for sending a security report email
 */
interface EmailOptions {
    eml?: EmlData;                   // Original email data if available
    from?: string;                   // Sender address (defaults to env variable)
    to: string | string[];           // Recipient(s)
    subject: string;                 // Email subject
    securityScore: number;           // Security score (0 to maxScore)
    maxScore: number;                // Maximum possible score
    urlReport: LinkTestSuiteResult;  // Results of URL security checks
    llmReport: LlmTestSuiteResult;   // Results of AI-based analysis
    originalSubject: string;         // Subject of the analyzed email
    originalFrom: string;            // Sender of the analyzed email
}

/**
 * Extended email options that include header analysis results
 */
interface EmailOptionsWithHeader extends EmailOptions {
    headerReport: HeaderTestSuiteResult; // Results of email header analysis
}

/**
 * Handles the creation and sending of security report emails
 */
class EmailSender {
    private transporter: Transporter;

    constructor(transporterOptions?: nodemailer.TransportOptions) {
        this.transporter = nodemailer.createTransport({
            host: process.env.MAIL_SERVER,
            port: 465,
            secure: true,
            auth: {
                user: process.env.MAIL_USERNAME,
                pass: process.env.MAIL_PASSWORD
            },
            ...transporterOptions,
        });
    }

    /**
     * Detects explanation terms in text and converts them to clickable links
     * @param text Text to process
     * @returns Text with explanation terms converted to HTML links
     */
    private detectAndLinkExplanationTerms(text: string): string {
        try {
            const host = 'https://' + (process.env.MAIL_USERNAME ?? 'mailcheck.help').split('@')[1];
            return text.replace(/\[\[([^\]]+)\]\]/g, (_, term) => {
                const termData = TestSuiteRunner.explanationTerms[term];
                if (termData) {
                    return `<a href="${host}${termData.path}">${term}</a>`;
                } else {
                    return term;
                }
            });
        } catch (error) {
            console.error('❌ Error linking explanation terms:', text, error);
            return text;
        }
    }

    /**
     * Sends an email notifying the user they've exceeded their rate limit
     * @param to Recipient email address
     * @param subject Original email subject
     */
    public async sendRateLimitExceededEmail(to: string, subject: string): Promise<void> {
        const mailOptions: Mail.Options = {
            from: process.env.MAIL_USERNAME,
            to,
            subject: 'Kostenfreie E-Mail-Checks aufgebraucht - ' + subject,
            text: 'Sie haben Ihre kostenlosen E-Mail-Checks für heute verbraucht. Bitte versuchen Sie es in 24 Stunden erneut. Bitte beachten Sie, dass Ihre E-Mail mit diesem Betreff nicht bei uns gespeichert wurde. Senden Sie eine neue E-Mail, sobald Ihre Kontingente wieder verfügbar sind.',
            html: `
            <html>
            <body>
                <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                <h2>Kostenfreie E-Mail-Checks aufgebraucht</h2>
                <p>Sehr geehrter Nutzer,</p>
                <p>Sie haben Ihre kostenlosen E-Mail-Checks für heute verbraucht. Bitte versuchen Sie es in <strong>24 Stunden</strong> erneut.</p>
                <p>Bitte beachten Sie, dass Ihre E-Mail mit dem Betreff <strong>${subject}</strong> nicht bei uns gespeichert wurde. Senden Sie eine neue E-Mail, sobald Ihre Kontingente wieder verfügbar sind.</p>
                <p>Vielen Dank für Ihr Verständnis.</p>
                <hr>
                <p style="font-size: 12px; color: #777;">Wenn Sie glauben, dass dies ein Fehler ist, kontaktieren Sie bitte den Support.</p>
                </div>
            </body>
            </html>
        `,
        };
        await this.transporter.sendMail(mailOptions);
        this.log('Rate limit exceeded email sent with HTML content successfully to ' + to);
    }

    /**
     * Sends an email notifying the user that their email couldn't be processed due to SPF failure
     * @param to Recipient email address
     * @param originalSubject Original email subject
     */
    public async sendUnsafeSenderEmail(to: string, originalSubject: string): Promise<void> {
        const mailOptions: Mail.Options = {
            from: process.env.MAIL_USERNAME,
            to,
            subject: 'Ihre E-Mail konnte nicht verarbeitet werden',
            text: `Sehr geehrter Nutzer,
        Ihre E-Mail mit dem Betreff "${originalSubject}" konnte nicht verarbeitet werden, da sie den SPF-Test nicht bestanden hat. Um Missbrauch zu verhindern, werden alle nicht autorisierten Einsendungen sofort gelöscht.
        Bitte stellen Sie sicher, dass Ihre E-Mail den SPF-Richtlinien entspricht und versuchen Sie es erneut.
        Wenden Sie sich an Ihren E-Mail-Provider, wenn Sie Hilfe bei der Konfiguration benötigen.
        Vielen Dank für Ihr Verständnis.

        Mit freundlichen Grüßen,
        Ihr Analyse-Team`,
            html: this.detectAndLinkExplanationTerms(`
                    <html>
                    <body>
                        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                            <h2>Verarbeitung Ihrer E-Mail fehlgeschlagen</h2>
                            <p>Sehr geehrter Nutzer,</p>
                            <p>Ihre E-Mail mit dem Betreff <strong>"${this.escapeHtml(originalSubject)}"</strong> konnte nicht verarbeitet werden, da sie den <strong>[[SPF]]-Test</strong> nicht bestanden hat. Um Missbrauch zu verhindern, werden alle nicht autorisierten Einsendungen sofort gelöscht.</p>
                            <p>Bitte stellen Sie sicher, dass Ihre E-Mail den SPF-Richtlinien entspricht und versuchen Sie es erneut.</p>
                            <p>Wenden Sie sich an Ihren E-Mail-Provider, wenn Sie Hilfe bei der Konfiguration benötigen.</p>
                            <p>Vielen Dank für Ihr Verständnis.</p>
                            <hr>
                            <p style="font-size: 12px; color: #777;">
                                Wenn Sie glauben, dass dies ein Fehler ist, kontaktieren Sie bitte den Support.
                            </p>
                        </div>
                    </body>
                    </html>
                `),
        };
        await this.transporter.sendMail(mailOptions);
        this.log('Unsafe sender email notification sent successfully to ' + to);
    }


    /**
     * Sends a formatted security report email with embedded images
     * @param options Options for the email including security analysis results
     */
    public async sendSecurityReport(options: EmailOptionsWithHeader): Promise<void> {
        if (!options.eml && !options.to) {
            throw new Error('Either eml or to must be provided.');
        }
        const { from, to, subject, securityScore, headerReport, urlReport, llmReport, eml, originalSubject, originalFrom, maxScore } = options;

        const scoreImageBuffer = await this.generateDonutChartImage(securityScore, maxScore);
        const checkIcons = await this.generateCheckIcons();

        const scoreImageCid = `score-image-${uuidv4()}@email`;
        const checkIconCid = `check-icon-${uuidv4()}@email`;
        const crossIconCid = `cross-icon-${uuidv4()}@email`;

        const htmlContent = await this.generateHtmlContent(
            maxScore,
            headerReport,
            originalSubject,
            originalFrom,
            urlReport,
            llmReport,
            scoreImageCid,
            checkIconCid,
            crossIconCid
        );

        const receiver = eml?.senderAddress ?? to;

        const attachments: Mail.Attachment[] = [
            {
                filename: 'score.png',
                content: scoreImageBuffer,
                cid: scoreImageCid,
                contentType: 'image/png'
            }
        ];

        if (htmlContent.includes(checkIconCid)) {
            attachments.push({
                filename: 'pass.png',
                content: checkIcons.check,
                cid: checkIconCid,
                contentType: 'image/png'
            });
        }

        if (htmlContent.includes(crossIconCid)) {
            attachments.push({
                filename: 'fail.png',
                content: checkIcons.cross,
                cid: crossIconCid,
                contentType: 'image/png'
            });
        }

        const mailOptions: nodemailer.SendMailOptions = {
            from: from ?? process.env.MAIL_USERNAME,
            to: receiver,
            subject,
            html: htmlContent,
            attachments,
        };

        try {
            await this.transporter.sendMail(mailOptions);
            this.log('Security report email sent successfully to ' + (receiver ? `${receiver}` : ''));
        } catch (error) {
            console.error('Error sending security report email:', error);
            throw error;
        }
    }

    /**
     * Sends a security report email without header analysis
     * Used when only partial analysis is available (e.g., forwarded as text)
     * @param options Options for the email including available security analysis results
     */
    public async sendSecurityReportWithoutHeaderAnalysis(options: EmailOptions): Promise<void> {
        const { from, to, subject, securityScore, urlReport, llmReport, eml, originalSubject, originalFrom, maxScore } = options;

        const scoreImageBuffer = await this.generateDonutChartImage(securityScore, maxScore);
        const checkIcons = await this.generateCheckIcons();

        const scoreImageCid = `score-image-${uuidv4()}@email`;
        const checkIconCid = `check-icon-${uuidv4()}@email`;
        const crossIconCid = `cross-icon-${uuidv4()}@email`;

        const htmlContent = `
        <!DOCTYPE html>
        <html lang="de">
        <head>
            <meta charset="UTF-8">
            <title>Sicherheitsbericht</title>
            <style>
                ${this.generateEmailStyles(securityScore, maxScore)}
            </style>
        </head>
        <body>
        <div class="container">
            <h1>Sicherheitsbericht</h1>
            
            <div class="original-email">
            <h2>Überprüfte E-Mail:</h2>
            <p><strong>Betreff:</strong> ${this.escapeHtml(originalSubject)}</p>
            <p><strong>Absender:</strong> ${this.escapeHtml(originalFrom)}</p>
            </div>

            <div class="warning-box">
                <p>⚠️ Du hast diese E-Mail nicht als Anhang an uns weitergeleitet, sondern nur als Text. 
                Nur wenn uns die <a href="https://${(process.env.MAIL_USERNAME ?? 'mailcheck.help').split('@')[1]}/how" style="color: #007BFF; text-decoration: underline;">Originale Mail Datei</a> vorliegt, 
                können wir eine vollständige Analyse durchführen.
            </p>
            </div>

            <div class="score-container">
            <img class="score-img" src="cid:${scoreImageCid}" alt="Sicherheits-Score: ${securityScore}" />
            </div>

            <div class="llm-report">
            <h2 class="section-title">KI-Analyse</h2>
            <h3 class="score-text"><strong>${this.escapeHtml(llmReport.title)}</strong></h3>
            ${llmReport.threats.length > 0 ? `
            <div class="threats">
                ${llmReport.threats.map(threat => this.renderThreat(threat)).join('')}
            </div>
            ` : ''}
            <div class="llm-explanation">
                <strong>Erklärung:</strong> ${this.escapeHtml(llmReport.explanation)} <span class="header-message">(+${llmReport.trustPoints})</span>
            </div>
            </div>

            <div class="url-checks">
            <h2 class="section-title">URL-Analyse</h2>
            <p>Die folgenden URLs wurden gefunden und überprüft. Dabei wurde lediglich die Übereinstimmung der URL und des Hosts mit bekannten Blacklists überprüft. Dass eine URL nicht auf einer solchen Liste steht, garantiert jedoch nicht, dass sie sicher ist.</p>
            ${urlReport.checks.map(url => this.renderUrlCheck(url, checkIconCid, crossIconCid)).join('')}
            </div>
        </div>
        </body>
        </html>
        `;

        const receiver = eml?.senderAddress ?? to;

        const attachments: Mail.Attachment[] = [
            {
                filename: 'score.png',
                content: scoreImageBuffer,
                cid: scoreImageCid,
                contentType: 'image/png'
            }
        ];

        if (htmlContent.includes(checkIconCid)) {
            attachments.push({
                filename: 'pass.png',
                content: checkIcons.check,
                cid: checkIconCid,
                contentType: 'image/png'
            });
        }

        if (htmlContent.includes(crossIconCid)) {
            attachments.push({
                filename: 'fail.png',
                content: checkIcons.cross,
                cid: crossIconCid,
                contentType: 'image/png'
            });
        }

        const mailOptions: nodemailer.SendMailOptions = {
            from: from ?? process.env.MAIL_USERNAME,
            to: receiver,
            subject,
            html: htmlContent,
            attachments,
        };

        try {
            await this.transporter.sendMail(mailOptions);
            this.log('Security report email (without header analysis) sent successfully to ' + (receiver ? `${receiver}` : ''));
        } catch (error) {
            console.error('Error sending security report email without header analysis:', error);
            throw error;
        }
    }

    /**
     * Generates CSS styles for the email report
     * @param score Current security score
     * @param maxScore Maximum possible score
     * @returns CSS styles as a string
     */
    private generateEmailStyles(score: number, maxScore: number): string {
        return `
        body {
            background-color: #ffffff;
            color: #333333;
            font-family: Arial, sans-serif;
            padding: 20px;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background-color: #f9f9f9;
            padding: 20px;
            border-radius: 10px;
            border: 1px solid #ddd;
        }
        h1 {
            text-align: center;
            color: #333333;
        }
        .original-email {
            background-color: #eef;
            padding: 10px;
            border-radius: 5px;
            margin-bottom: 20px;
        }
        .original-email p {
            margin: 5px 0;
        }
        .score-container {
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 20px 0;
        }
        .score-img {
            width: 150px;
            height: 150px;
            margin-right: 20px;
        }
        .header-checks, .url-checks, .llm-report {
            margin: 20px 0;
        }
        .section-title {
            font-size: 20px;
            margin-bottom: 10px;
            color: #333333;
            border-bottom: 2px solid #ddd;
            padding-bottom: 5px;
        }
        .score-text {
            font-size: 20px;
            font-weight: bold;
            color: ${this.getScoreColor(score, maxScore)};
        }
        .header-check, .url-check, .threat {
            display: flex;
            align-items: center;
            padding: 10px;
            border-bottom: 1px solid #ccc;
        }
        .header-check:last-child, .url-check:last-child, .threat:last-child {
            border-bottom: none;
        }
        .header-icon, .url-icon, .threat-icon {
            width: 24px;
            height: 24px;
            margin-right: 10px;
            flex-shrink: 0;
        }
        .header-title, .url-title {
            font-size: 18px;
            flex-grow: 1;
        }
        .threat-title {
            font-size: 16px;
            width: 225px;
            padding-right: 15px;
        }
        .header-message, .url-message, .threat-message {
            font-size: 14px;
            color: #666666;
        }
        .summary {
            margin: 20px 0;
            font-size: 16px;
            line-height: 1.5;
        }
        .section-title {
            font-size: 20px;
            margin-bottom: 10px;
            color: #333333;
            border-bottom: 2px solid #ddd;
            padding-bottom: 5px;
        }
        .llm-explanation {
            font-size: 16px;
            margin-top: 10px;
            color: #333333;
        }
        a {
            color: #1a0dab;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        .warning-box {
            background-color: #ffe6e6;
            border: 1px solid #ff4d4d;
            color: #cc0000;
            padding: 10px;
            border-radius: 5px;
            margin: 10px 0;
            font-size: 14px;
            font-weight: bold;
        }
        .warning-box p {
            margin: 0;
            line-height: 1.5;
        }
        `;
    }

    /**
     * Generates the complete HTML content for the security report email
     * @param maxScore Maximum possible security score
     * @param headerReport Results of header analysis
     * @param originalSubject Subject of the analyzed email
     * @param originalFrom Sender of the analyzed email
     * @param urlReport Results of URL security checks
     * @param llmReport Results of AI-based analysis
     * @param scoreImageCid Content ID for the score image
     * @param checkIconCid Content ID for the check icon
     * @param crossIconCid Content ID for the cross icon
     * @returns Complete HTML content for the email
     */
    private async generateHtmlContent(
        maxScore: number,
        headerReport: HeaderTestSuiteResult,
        originalSubject: string,
        originalFrom: string,
        urlReport: LinkTestSuiteResult,
        llmReport: LlmTestSuiteResult,
        scoreImageCid: string,
        checkIconCid: string,
        crossIconCid: string
    ): Promise<string> {
        const totalScore = llmReport.trustPoints;
        return `
        <!DOCTYPE html>
        <html lang="de">
        <head>
            <meta charset="UTF-8">
            <title>Sicherheitsbericht</title>
            <style>
                ${this.generateEmailStyles(totalScore, maxScore)}
            </style>
        </head>
            <body>
            <div class="container">
                <h1>Sicherheitsbericht</h1>
                
                <div class="original-email">
                <h2>Überprüfte E-Mail:</h2>
                <p><strong>Betreff:</strong> ${this.escapeHtml(originalSubject)}</p>
                <p><strong>Absender:</strong> ${this.escapeHtml(originalFrom)}</p>
                </div>

                <div class="score-container">
                <img class="score-img" src="cid:${scoreImageCid}" alt="Sicherheits-Score: ${totalScore}" />
                </div>

                <div class="llm-report">
                <h2 class="section-title">KI-Analyse</h2>
                <h3 class="score-text"><strong>${this.escapeHtml(llmReport.title)}</strong></h3>
                ${llmReport.threats.length > 0 ? `
                <div class="threats">
                    ${llmReport.threats.map(threat => this.renderThreat(threat)).join('')}
                </div>
                ` : ''}
                <div class="llm-explanation">
                    <strong>Erklärung:</strong> ${this.escapeHtml(llmReport.explanation)}<span class="header-message"> (+${llmReport.trustPoints})</span>
                </div>
                </div>

                <div class="header-checks">
                <h2 class="section-title">Header-Analyse</h2>
                ${headerReport.checks.map(header => this.renderHeaderCheck(header, checkIconCid, crossIconCid)).join('')}
                </div>

                <div class="url-checks">
                <h2 class="section-title">URL-Analyse</h2>
                <p>Die folgenden URLs wurden gefunden und überprüft. Dabei wurde lediglich die Übereinstimmung der URL und des Hosts mit bekannten Blacklists überprüft. Dass eine URL nicht auf einer solchen Liste steht, garantiert jedoch nicht, dass sie sicher ist.</p>
                ${urlReport.checks.map(url => this.renderUrlCheck(url, checkIconCid, crossIconCid)).join('')}
                </div>
            </div>
            </body>
        </html>
        `;
    }

    /**
     * Renders a single header check result as HTML with icon references
     * @param header The header check result
     * @param checkIconCid Content ID for the check icon
     * @param crossIconCid Content ID for the cross icon
     * @returns HTML string representing the header check
     */
    private renderHeaderCheck(header: HeaderCheck, checkIconCid: string, crossIconCid: string): string {
        const isPassed = header.passed;
        const iconCid = isPassed ? checkIconCid : crossIconCid;
        const altText = isPassed ? 'Bestanden' : 'Nicht bestanden';
        const statusText = isPassed ? 'Bestanden' : 'Nicht bestanden';
        const severityColor = isPassed ? '#4caf50' : this.getSeverityColor(header.severity ?? 'low');

        return `
    <div class="header-check">
        <img class="header-icon" src="cid:${iconCid}" alt="${altText}" style="filter: drop-shadow(0px 0px 2px ${severityColor});" />
        <div>
            <div class="header-title">${this.escapeHtml(header.title)} (${statusText})</div>
            <div class="header-message">${this.escapeHtml(header.message)}</div>
        </div>
    </div>
    `;
    }

    /**
     * Renders a single URL check result as HTML with icon references
     * @param url The URL check result
     * @param checkIconCid Content ID for the check icon
     * @param crossIconCid Content ID for the cross icon
     * @returns HTML string representing the URL check
     */
    private renderUrlCheck(url: UrlCheck, checkIconCid: string, crossIconCid: string): string {
        const iconCid = url.passed ? checkIconCid : crossIconCid;
        const statusText = url.passed ? 'Nicht auffällig' : 'Auf Blacklist gefunden';

        let messageContent: string;

        if (typeof url.message === 'string') {
            messageContent = this.escapeHtml(url.message);
        } else if (Array.isArray(url.message)) {
            messageContent = `<ul>${url.message.map(subUrl => this.renderUrlCheck(subUrl, checkIconCid, crossIconCid)).join('')}</ul>`;
        } else {
            messageContent = this.escapeHtml(String(url.message));
        }

        // Add a preview link if a screenshot UUID is available
        let screenshotLink = '';
        if (url.screenshot) {
            const previewUrl = `https://${(process.env.MAIL_USERNAME ?? 'mailcheck.help').split('@')[1]}/screenshot/${this.escapeHtml(url.screenshot)}`;
            screenshotLink = `<div class="screenshot-preview"><a href="${previewUrl}">Screenshot anschauen</a></div>`;
        }

        return `
        <div class="url-check">
            <img class="url-icon" src="cid:${iconCid}" alt="${statusText}" />
            <div>
                <div class="url-title">${this.escapeHtml(url.title)}   (${statusText})</div>
                <div class="url-message">${messageContent}</div>
                ${screenshotLink}
            </div>
        </div>
        `;
    }

    /**
     * Renders a single threat detection as HTML
     * @param threat The detected threat
     * @returns HTML string representing the threat
     */
    private renderThreat(threat: HtmlThreat): string {
        const severityColor = this.getSeverityColor(threat.severity);

        return `
        <div class="threat">
            <div class="threat-title" style="color: ${severityColor}; font-weight: bold;">
            ${this.escapeHtml(threat.title)}
            </div>
            <div class="threat-message">${this.escapeHtml(threat.description)}</div>
        </div>
        `;
    }

    /**
     * Generates a donut chart image showing the security score
     * @param score The security score
     * @param maxScore Maximum possible score
     * @returns Buffer containing the PNG image
     */
    private async generateDonutChartImage(score: number, maxScore: number): Promise<Buffer> {
        const scoreColor = this.getScoreColor(score, maxScore);
        const percentage = (score / maxScore) * 100;

        const svg = `
        <svg width="120" height="120" xmlns="http://www.w3.org/2000/svg">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@700&amp;display=swap');
                text {
                    font-family: 'Roboto', sans-serif;
                }
            </style>
            <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(90, 90, 90, 0.43)" stroke-width="16"/>
            <circle cx="60" cy="60" r="50" fill="none" stroke="${scoreColor}" stroke-width="13" stroke-dasharray="${(percentage / 100) * 2 * Math.PI * 50} ${(1 - percentage / 100) * 2 * Math.PI * 50}" stroke-linecap="round"/>
            <rect x="30" y="45" width="60" height="30" rx="10" ry="10" fill="rgba(0, 0, 0, 0.1)"/>
            <text x="60" y="65" text-anchor="middle" font-size="20" fill="rgb(164, 164, 164)" font-weight="bold">${score}/${maxScore}</text>
        </svg>
        `;

        const pngBuffer = await sharp(Buffer.from(svg))
            .png()
            .toBuffer();

        return pngBuffer;
    }

    /**
     * Generates check and cross icons as PNG buffers
     * @returns Object containing buffers for check and cross icons
     */
    private async generateCheckIcons(): Promise<{ check: Buffer, cross: Buffer }> {
        // Definiere die SVGs für Check und Kreuz
        const checkSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="#4caf50" viewBox="0 0 24 24" width="24" height="24">
            <path d="M20.285 2.708l-11.285 11.292-5.285-5.292-3.715 3.708 9 9.0 15-15z"/>
        </svg>
        `;

        const crossSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="#f44336" viewBox="0 0 24 24" width="24" height="24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
        `;

        // Konvertiere SVGs zu PNG-Buffer mit Sharp
        const checkPngBuffer = await sharp(Buffer.from(checkSvg))
            .png()
            .toBuffer();

        const crossPngBuffer = await sharp(Buffer.from(crossSvg))
            .png()
            .toBuffer();

        return {
            check: checkPngBuffer,
            cross: crossPngBuffer
        };
    }

    /**
     * Determines the color based on the security score
     * @param score The security score (0-maxScore)
     * @param maxScore Maximum possible score
     * @returns HSL color string (green for high scores, red for low scores)
     */
    private getScoreColor(score: number, maxScore: number): string {
        const hue = (score / maxScore) * 120;
        const saturation = 70; // Reduzierte Sättigung für weniger helles Grün
        const lightness = 40;  // Angepasste Helligkeit
        return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }

    /**
     * Determines the color based on the threat severity
     * @param severity The threat severity level
     * @returns Hex color code corresponding to the severity
     */
    private getSeverityColor(severity: 'low' | 'medium' | 'high'): string {
        switch (severity) {
            case 'low':
                return '#ffeb3b'; // Gelb
            case 'medium':
                return '#ff9800'; // Orange
            case 'high':
                return '#f44336'; // Rot
            default:
                return '#333333'; // Standardfarbe
        }
    }

    /**
     * Logs events related to email sending
     * Can be overridden in derived classes
     * @param message Message to log
     */
    protected log(message: string) {
        console.log('EmailSender:', message);
    }

    /**
     * Escapes HTML to prevent injection and applies explanation term linking
     * @param unsafe The potentially unsafe string
     * @returns Sanitized string with explanation terms linked
     */
    private escapeHtml(unsafe: string): string {
        try {
            return this.detectAndLinkExplanationTerms(unsafe
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;"));
        } catch (error) {
            console.error('❌ Error escaping HTML:', unsafe, error);
            return this.detectAndLinkExplanationTerms(unsafe);
        }
    }
}

export { EmailSender, EmailOptions, HeaderCheck, UrlCheck, LlmTestSuiteResult, HtmlThreat };
