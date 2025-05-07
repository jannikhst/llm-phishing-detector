import { CustomLogger } from "../../utils/logger";

/**
 * Logger for analysis report results
 * Records the results of email security analysis in JSON format
 */
export class ReportResultLogger extends CustomLogger<{ [key: string]: any }> {
    /**
     * Creates a new report result logger that writes to result.log
     */
    constructor() {
        super('result.log');
    }

    /**
     * Logs analysis report data
     * @param data The report data to log (any JSON-serializable object)
     */
    async log(data: { [key: string]: any }): Promise<void> {
        const logData = `${new Date().toISOString()} - ${JSON.stringify(data)}\n`;
        await this.append(logData);
    }
}
