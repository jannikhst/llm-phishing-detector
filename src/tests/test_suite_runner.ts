import { HeaderTestSuite } from "./header_test_suite";
import { LinkTestSuite, LinkTestSuiteResult, UrlCheck } from "./link_test_suite";
import { LlmTestSuite, LlmTestSuiteResult } from "./llm_test_suite";
import { EmlData } from "../mails/eml_parser";
import { HeaderCheck, HeaderTestSuiteResult } from "../mails/mail_sender";
import { ReportResultLogger } from "../config/logger/report_results";

/**
 * Coordinates the execution of all test suites for email analysis
 * Manages the flow of data between different test suites and combines results
 */
export class TestSuiteRunner {

    /**
     * Dictionary of security terms with their explanations
     * Used to provide educational content about email security concepts
     */
    static readonly explanationTerms: {
        [key: string]: {
            path: string;
            explanation: string;
        }
    } = {
            'DKIM': {
                path: '/explain/dkim',
                explanation: 'DKIM (DomainKeys Identified Mail) ist ein Verfahren, um die Authentizität einer E-Mail zu überprüfen. Dabei wird die E-Mail digital signiert und mit einem öffentlichen Schlüssel des Absenders versehen. Der Empfänger kann dann mit dem öffentlichen Schlüssel die Signatur überprüfen und so sicherstellen, dass die E-Mail tatsächlich vom angegebenen Absender stammt.'
            },
            'SPF': {
                path: '/explain/spf',
                explanation: 'SPF (Sender Policy Framework) ist ein Verfahren, um die Authentizität einer E-Mail zu überprüfen. Dabei wird im DNS ein SPF-Eintrag hinterlegt, der angibt, von welchen Servern E-Mails für die Domain versendet werden dürfen. Der Empfänger kann dann prüfen, ob die E-Mail von einem erlaubten Server stammt.'
            },
            'Return-Path': {
                path: '/explain/return-path',
                explanation: 'Der Return-Path ist eine E-Mail-Adresse, an die E-Mails zurückgesendet werden, wenn sie nicht zugestellt werden konnten. Er wird im Header der E-Mail angegeben und kann Auskunft darüber geben, wer die E-Mail tatsächlich versendet hat. Der Return-Path sollte in der Regel mit der Absender-Domain übereinstimmen.'
            },
            'Domain': {
                path: '/explain/domain',
                explanation: 'Die Domain ist der Teil einer E-Mail nach dem @-Zeichen. Sie gibt Auskunft darüber, von welchem Server die E-Mail versendet wurde. Sie kann auf eine Blacklist gesetzt sein, wenn sie für Spam oder Phishing missbraucht wurde. Es ist daher wichtig, die Domain zu überprüfen, um die Authentizität der E-Mail zu gewährleisten.'
            },
            'Blacklist': {
                path: '/explain/blacklist',
                explanation: 'Eine Blacklist ist eine Liste von Domains oder IP-Adressen, die als Quelle von Spam oder Phishing bekannt sind. Diese Listen werden von verschiedenen Organisationen geführt und können dazu dienen, verdächtige E-Mails zu identifizieren. Wenn eine Domain auf einer Blacklist steht, ist Vorsicht geboten.'
            },
            'Weiterleitung': {
                path: '/explain/weiterleitung',
                explanation: 'Eine URL-Weiterleitung ist eine Technik, um den Benutzer von einer URL zu einer anderen weiterzuleiten. Dies kann dazu genutzt werden, um den Benutzer auf eine gefälschte oder schädliche Webseite zu leiten. Es ist daher wichtig, die Weiterleitungen in einer E-Mail zu überprüfen, um sicherzustellen, dass sie sicher sind.'
            },
            'EML-Datei': {
                path: '/explain/eml-datei',
                explanation: 'Eine EML-Datei ist ein Dateiformat, das für E-Mails verwendet wird. Sie enthält den gesamten Inhalt einer E-Mail. Neben dem eigentlichen Text können auch Anhänge wie Bilder oder Dokumente enthalten sein. Nur wenn die Mail als EML-Datei vorliegt, können alle Informationen überprüft werden.'
            },
            'Phishing': {
                path: '/explain/phishing',
                explanation: 'Phishing ist eine Methode, bei der Betrüger versuchen, über gefälschte E-Mails an sensible Daten wie Passwörter oder Kreditkartennummern zu gelangen. Solche E-Mails wirken oft täuschend echt und fordern den Empfänger zu einer Handlung auf, etwa zum Klicken auf einen Link.'
            },
            'Spoofing': {
                path: '/explain/spoofing',
                explanation: 'Beim E-Mail-Spoofing wird die Absenderadresse einer E-Mail gefälscht, sodass sie so aussieht, als stamme sie von einer vertrauenswürdigen Quelle. Dadurch sollen Empfänger getäuscht und zu einer Handlung verleitet werden.'
            },
            'DMARC': {
                path: '/explain/dmarc',
                explanation: 'DMARC (Domain-based Message Authentication, Reporting and Conformance) baut auf DKIM und SPF auf. Es ermöglicht Domaininhabern festzulegen, wie Empfänger mit E-Mails umgehen sollen, die die Authentifizierungsprüfungen nicht bestehen, und liefert Berichte über diese Vorgänge.'
            },
            'Header': {
                path: '/explain/header',
                explanation: 'Der Header einer E-Mail enthält Metadaten wie Absender, Empfänger, Betreff und Informationen über die Übertragungswege der Nachricht. Eine Analyse des Headers kann Hinweise auf Manipulationen oder Spoofing geben.'
            },
            'MIME': {
                path: '/explain/mime',
                explanation: 'MIME (Multipurpose Internet Mail Extensions) ist ein Standard, der es erlaubt, E-Mails mit Anhängen und in verschiedenen Formaten (z.B. HTML, Text) zu versenden. Auch verschlüsselte oder signierte E-Mails basieren auf MIME.'
            },
            'Attachment': {
                path: '/explain/attachment',
                explanation: 'Ein Attachment ist ein Anhang an eine E-Mail, z.B. ein Dokument oder ein Bild. Anhänge können Viren oder Malware enthalten. Anhänge sollten nur geöffnet werden, wenn die Quelle vertrauenswürdig ist.'
            }
        };

    /**
     * Runs all test suites for the given email
     * @param email The email data to analyze
     * @param isRedirect Whether this is a forwarded email (without full headers)
     * @returns Results from all test suites
     */
    public static async runTests(email: EmlData, isRedirect: boolean): Promise<{ header?: HeaderTestSuiteResult, link: LinkTestSuiteResult, llm: LlmTestSuiteResult }> {
        const resultLogger = new ReportResultLogger();
        let headerReport = undefined;
        let headerLlmReport = null;

        if (!isRedirect) {
            const headerTestSuite = new HeaderTestSuite();
            const headerResult = await headerTestSuite.runTests(email);
            headerReport = headerResult.report;
            headerLlmReport = headerResult.llmInfo;
        }

        // Run link test suite to analyze URLs in the email
        const linkTestSuite = new LinkTestSuite();
        const { report: linkChecks, llmInfo: linkLlmReport } = await linkTestSuite.runTests(email);

        // Run AI analysis with the appropriate prompt template
        const llmPromptType = isRedirect ? 'prompt_no_eml' : 'prompt_eml';
        const llmTestSuite = new LlmTestSuite(llmPromptType);
        const llmResult = await llmTestSuite.runTests({
            input: email,
            header_llm_data: headerLlmReport || email.subject,
            link_llm_data: linkLlmReport,
        });

        const result = {
            header: headerReport,
            link: linkChecks,
            llm: llmResult,
        };

        resultLogger.log(result);
        return result;
    }
}
