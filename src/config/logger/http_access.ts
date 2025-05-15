import { CustomLogger } from "../../utils/logger";

/**
 * Data structure for HTTP access logging
 * Contains client IP and request duration
 */
interface AccessLogData { 
    ip: string;       // Client IP address
    duration: number; // Request processing time in milliseconds
}

/**
 * Logger for HTTP access information
 * Records client IP addresses and request durations to a log file
 */
export class HttpAccessLogger extends CustomLogger<AccessLogData> {
    /**
     * Creates a new HTTP access logger that writes to http.log
     */
    constructor() {
        super('http.log');
    }

    /**
     * Logs HTTP access information
     * @param data The access data to log (IP and duration)
     */
    async log(data: AccessLogData): Promise<void> {
        const logData = `${new Date().toISOString()} - IP: ${data.ip}, Duration: ${data.duration}ms\n`;
        await this.append(logData);
    }
}
