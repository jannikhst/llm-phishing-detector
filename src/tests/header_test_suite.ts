import { EmlData } from "../mails/eml_parser";
import { checkUrl } from "../url/domain_checker";
import { HeaderTestSuiteResult } from "../mails/mail_sender";

/**
 * Test suite for analyzing email headers for security issues
 * Performs checks on sender domains, mail servers, SPF, DKIM, and attachments
 */
export class HeaderTestSuite {

    /**
     * Runs all security checks on the given email
     * @param input The email data as a Buffer or EmlData object
     * @returns Test results and information for LLM analysis
     */
    public async runTests(input: Buffer | EmlData): Promise<{ report: HeaderTestSuiteResult, llmInfo: string }> {
        const result: HeaderTestSuiteResult = {
            checks: [],
        };

        let eml = input instanceof Buffer ? await EmlData.fromBuffer(input) : input as EmlData;
        if (!eml) {
            result.checks.push({
                title: 'Dateifehler',
                passed: false,
                message: 'Die EML-Datei konnte nicht korrekt gelesen werden.',
                severity: 'high',
            });
            return { report: result, llmInfo: '' };
        }

        let llmInfo = '';

        // Check if the sender domain is on any blacklists
        const senderAddress = eml.senderAddress;
        const senderDomain = senderAddress.split('@')[1];
        const senderDomainBlacklistResult = await this.checkDomainAgainstDBL(senderDomain);
        result.checks.push({
            title: `Prüfung der Absender-Domain`,
            passed: !senderDomainBlacklistResult,
            message: senderDomainBlacklistResult
                ? `${senderDomain} wurde auf einer Blacklist gefunden.`
                : `${senderDomain} wurde auf keiner Blacklist gefunden.`,
            severity: senderDomainBlacklistResult ? 'high' : undefined,
        });
        llmInfo += `Sender E-Mail: ${senderAddress}\n`;
        if (senderDomainBlacklistResult) {
            llmInfo += `Sender-Domain is blacklisted: ${senderDomainBlacklistResult}\n`;
        }
        llmInfo += `Sender-Name: ${eml.senderName}\n`;
        llmInfo += `Subject: ${eml.subject}\n`;

        // Check if the sender's mail server is on any blacklists
        const senderMailserver = eml.senderMailserverHostname;
        if (senderMailserver) {
            const senderMailserverBlacklistResult = await this.checkDomainAgainstDBL(senderMailserver);
            result.checks.push({
                title: `Prüfung des Absender-Mailservers`,
                passed: !senderMailserverBlacklistResult,
                message: senderMailserverBlacklistResult
                    ? `${senderMailserver} wurde auf einer Blacklist gefunden.`
                    : `${senderMailserver} wurde auf keiner Blacklist gefunden.`,
                severity: senderMailserverBlacklistResult ? 'high' : undefined,
            });
            llmInfo += `Sender Mailserver: ${senderMailserver}\n`;
            if (senderMailserverBlacklistResult) {
                llmInfo += `Mailserver is blacklisted: ${senderMailserverBlacklistResult}\n`;
            }
        }

        // Check if the Return-Path header matches the sender domain
        const returnPath = eml.returnPath;
        if (returnPath) {
            const returnPathDomain = returnPath.split('@')[1];
            llmInfo += `Return Path: ${returnPath}\n`;
            if (returnPathDomain !== senderDomain) {
                if (!returnPathDomain.endsWith(`.${senderDomain}`)) {
                    result.checks.push({
                        title: 'Überprüfen des Header "Return-Path"',
                        passed: false,
                        message: `Die Domain des Return Path (${returnPathDomain}) stimmt nicht mit der Absender-Domain (${senderDomain}) überein.`,
                        severity: 'low',
                    });
                }
                const returnPathDomainBlacklistResult = await this.checkDomainAgainstDBL(returnPathDomain);
                result.checks.push({
                    title: `Prüfung der Return Path-Domain`,
                    passed: !returnPathDomainBlacklistResult,
                    message: returnPathDomainBlacklistResult
                        ? `${returnPathDomain} wurde auf einer Blacklist gefunden.`
                        : `${returnPathDomain} wurde auf keiner Blacklist gefunden.`,
                    severity: returnPathDomainBlacklistResult ? 'high' : undefined,
                });
                if (returnPathDomainBlacklistResult) {
                    llmInfo += `Return Path-Domain is blacklisted: ${returnPathDomainBlacklistResult}\n`;
                }
            }
        }

        // Check if the email passes SPF validation (not spoofed)
        const spf = await eml.spoofingDetected();
        result.checks.push({
            title: 'Überprüfung auf Spoofing',
            passed: !spf,
            message: spf
                ? 'SPF-Prüfung ist fehlgeschlagen. Die Absenderadresse ist möglicherweise gefälscht.'
                : 'SPF-Prüfung bestanden.',
            severity: spf ? 'high' : undefined,
        });
        llmInfo += `SPF: ${spf ? 'Failed' : 'Passed'}\n`;

        // Check if the email has a valid DKIM signature (not modified)
        const dkim = await eml.isDkimValid();
        result.checks.push({
            title: 'Überprüfung ob Mail nachträglich verändert wurde.',
            passed: dkim,
            message: dkim
                ? 'DKIM-Signatur ist gültig. Die E-Mail ist authentifiziert.'
                : 'DKIM-Prüfung ist fehlgeschlagen. Die E-Mail könnte manipuliert sein.',
            severity: spf ? 'medium' : undefined,
        });
        llmInfo += `DKIM: ${dkim ? 'Passed' : 'Failed'}\n`;

        const attachments = await eml.scanAttachmentsForMalware();
        for (const att of attachments) {
            result.checks.push({
                title: `Überprüfung des Anhangs (${att.fileName}) auf Malware`,
                passed: att.viruses.length === 0,
                message: att.viruses.length === 0
                    ? `Keine Viren gefunden.`
                    : `Viren gefunden: ${att.viruses.join(', ')}.`,
                severity: att.viruses.length > 0 ? 'high' : undefined,
            });
        }
        if (attachments.length > 0) {
            llmInfo += `Attachments: ${attachments.map(att => att.fileName).join(', ')}\n`;
            llmInfo += `Virus Scan: ${attachments.every(att => att.viruses.length === 0) ? 'Passed' : 'Failed'}\n`;
        }
        return { report: result, llmInfo };
    }

    /**
     * Checks a domain against DNS blacklists (DBL)
     * @param domain The domain to check
     * @returns Error string if the domain is blacklisted, otherwise undefined
     */
    private async checkDomainAgainstDBL(domain: string): Promise<string | undefined> {
        try {
            const result = await checkUrl(domain);
            return result;
        } catch (error) {
            console.error(`Error checking domain ${domain} against DBL:`, error);
            return `Error checking domain: ${error}`;
        }
    }
}
