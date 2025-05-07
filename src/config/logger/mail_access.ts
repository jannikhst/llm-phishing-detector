import { CustomLogger } from "../../utils/logger";

/**
 * Data structure for email access logging
 * Contains sender information, processing duration, and SPF validation status
 */
interface AccessLogData {
    sender: string;    // Email sender address
    duration: number;  // Processing time in milliseconds
    subject: string;   // Email subject
    spf: boolean;      // Whether SPF validation passed
}

/**
 * Logger for email processing information
 * Records sender details, processing time, and security validation results
 */
export class MailAccessLogger extends CustomLogger<AccessLogData> {
    /**
     * Creates a new mail access logger that writes to mail.log
     */
    constructor() {
        super('mail.log');
    }

    /**
     * Logs email processing information
     * @param data The email processing data to log
     */
    async log(data: AccessLogData): Promise<void> {
        const logData = `${new Date().toISOString()} - Sender: ${data.sender}, Duration: ${data.duration}ms, Subject: ${data.subject}, SPF: ${data.spf}\n`;
        await this.append(logData);
    }
}
