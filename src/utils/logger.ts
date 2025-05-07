import fs from 'fs/promises';
import path from 'path';

/**
 * Abstract base class for custom logging functionality
 * Provides file-based logging with initialization, reading, and writing capabilities
 * @template T The type of data to be logged
 */
export abstract class CustomLogger<T> {
    protected logFilePath: string;
    private initPromise: Promise<void>;

    /**
     * Creates a new logger for the specified log file
     * @param logFileName Name of the log file to write to
     */
    constructor(logFileName: string) {
        this.logFilePath = path.join(__dirname, '..', 'data', 'tmp', 'logs', logFileName);
        this.initPromise = this.initialize();
    }

    // Initialization method to check and create the log file if it doesn't exist
    private async initialize() {
        try {
            await fs.access(this.logFilePath);
        } catch {
            const logDir = path.dirname(this.logFilePath);
            await fs.mkdir(logDir, { recursive: true });
            await fs.writeFile(this.logFilePath, '');
        }
    }

    /**
     * Abstract method for logging data, to be implemented by subclasses
     * @param data The data to log
     */
    abstract log(data: T): Promise<void>;

    /**
     * Clears the log file content
     */
    protected async clear() {
        await this.initPromise; // Ensure initialization is complete
        await fs.writeFile(this.logFilePath, '');
    }

    /**
     * Reads the entire log file content
     * @returns The log file content as a string
     */
    protected async read(): Promise<string> {
        await this.initPromise; // Ensure initialization is complete
        return await fs.readFile(this.logFilePath, 'utf-8');
    }

    /**
     * Appends data to the log file
     * @param data The string data to append
     */
    protected async append(data: string) {
        await this.initPromise; // Ensure initialization is complete
        await fs.appendFile(this.logFilePath, data);
    }
}
