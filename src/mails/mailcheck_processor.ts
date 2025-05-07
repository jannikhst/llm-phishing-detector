import { EmlData } from "./eml_parser";
import { EmailSender } from "./mail_sender";
import MailServerFsMount from "./mail_server_fs_mount";
import { TestSuiteRunner } from "../tests/test_suite_runner";
import { EmailRateLimiter } from "./rate_limit";
import { MailAccessLogger } from "../config/logger/mail_access";

/**
 * Processes incoming emails for security analysis
 * Extends MailServerFsMount to monitor filesystem for new emails
 * Handles rate limiting, spoofing detection, and sending security reports
 */
export class MailCheckProcessor extends MailServerFsMount {
    private rateLimiter: EmailRateLimiter;

    /**
     * Creates a new mail check processor
     * @param fsPath Path to the directory to monitor for new emails
     */
    constructor(fsPath?: string) {
        // Initialize the superclass with the provided filesystem path or a default path
        super(fsPath ?? '../../data/mailserver/start');
        this.rateLimiter = new EmailRateLimiter();
    }

    /**
     * Handles incoming emails by parsing, running test suites, and sending security reports.
     * @param raw The raw email data as a Buffer
     * @param onSuccess Callback to invoke upon successful processing
     */
    protected async onReceived(raw: Buffer, onSuccess: () => void): Promise<void> {
        const start = Date.now();
        const logger = new MailAccessLogger();
        // Parse the raw email data
        const parsedEmail = await EmlData.fromBuffer(raw);
        if (!parsedEmail) {
            console.error('Failed to parse email.');
            return;
        }

        const emailSender = new EmailSender();

        // We only allow mails that are not possibly spoofed to enforce the rate limit
        if (await parsedEmail.spoofingDetected()) {
            console.log('Spoofing detected:', parsedEmail.senderAddress);
            emailSender.sendUnsafeSenderEmail(parsedEmail.senderAddress, parsedEmail.subject);
            logger.log({ sender: parsedEmail.senderAddress, duration: Date.now() - start, subject: parsedEmail.subject, spf: false });
            onSuccess();
            return;
        }

        // Retrieve any nested emails (forwarded .eml attachments) within the parsed email
        const nestedEmails = await parsedEmail.findNestedEmlFiles();

        // Check if the sender has exceeded their rate limit
        if (this.rateLimiter.isExceeded(parsedEmail)) {
            const subjects = [parsedEmail.subject, ...nestedEmails.map(email => email.subject)].join(', ');
            console.log('Rate limiting email from:', parsedEmail.senderAddress);
            emailSender.sendRateLimitExceededEmail(parsedEmail.senderAddress, subjects);
            onSuccess();
            return;
        }

        // Handle differently based on whether there are nested emails or not
        if (nestedEmails.length === 0) {
            // For direct emails (no attachments), run tests without header analysis
            const { link, llm } = await TestSuiteRunner.runTests(parsedEmail, true);
            const emailOptions = {
                originalSubject: parsedEmail.subject,
                originalFrom: llm.senderName + ' <' + llm.senderAddress + '>',
                to: parsedEmail.senderAddress,
                securityScore: llm.trustPoints,
                maxScore: 5,
                subject: 'Sicherheitsbericht - ' + parsedEmail.senderName,
                urlReport: link,
                llmReport: llm,
            };

            try {
                await emailSender.sendSecurityReportWithoutHeaderAnalysis(emailOptions);
                this.log('Security report sent successfully.');
            } catch (error) {
                console.error('Error sending security report:', error);
            }

        } else {
            // For emails with nested .eml attachments, analyze each one with full header analysis
            for (const email of nestedEmails) {
                const { header, link, llm } = await TestSuiteRunner.runTests(email, false);

                const emailOptions = {
                    originalSubject: email.subject,
                    originalFrom: email.senderName + ' <' + email.senderAddress + '>',
                    to: parsedEmail.senderAddress,
                    securityScore: llm.trustPoints,
                    maxScore: 10,
                    subject: 'Sicherheitsbericht - ' + email.senderName,
                    headerReport: header!,
                    urlReport: link,
                    llmReport: llm,
                };

                try {
                    await emailSender.sendSecurityReport(emailOptions);
                } catch (error) {
                    console.error('Error sending security report:', error);
                }
            }
        }
        logger.log({ sender: parsedEmail.senderAddress, duration: Date.now() - start, subject: parsedEmail.subject, spf: true });
        // Invoke the success callback after processing
        onSuccess();
    }
}
