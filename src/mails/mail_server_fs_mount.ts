import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { promisify } from 'util';
import chokidar, { FSWatcher } from 'chokidar';

// Promisify file system operations for cleaner async code
const renameAsync = promisify(fs.rename);
const unlinkAsync = promisify(fs.unlink);
const readdirAsync = promisify(fs.readdir);
const statAsync = promisify(fs.stat);

/**
 * Simple callback type with no parameters and no return value
 */
type VoidCallback = () => void;

/**
 * Abstract class that monitors a filesystem for new mail files,
 * processes them, and manages cleanup of processed files.
 */
abstract class MailServerFsMount extends EventEmitter {
    protected watchPaths: string[];
    protected processedPath: string;
    protected cleanupIntervalMs: number = 15 * 60 * 1000; // 15 minutes
    protected fileAgeLimitMs: number = 60 * 60 * 1000; // 1 hour
    private watcher?: FSWatcher;
    private cleanupInterval?: NodeJS.Timeout;
    private processedFiles: Set<string>; // Set to prevent duplicate processing

    /**
     * Creates a new mail server filesystem mount
     * @param mountPath Base path where mail directories are located
     */
    constructor(mountPath: string) {
        super();
        // Define paths for monitoring /new and /cur directories
        this.watchPaths = [
            path.join(mountPath, 'new'),
            path.join(mountPath, 'cur'),
        ];
        // Define the processed directory
        this.processedPath = path.join(mountPath, '.Processed', 'cur');
        this.ensureProcessedPath();
        this.processedFiles = new Set();
    }

    /**
     * Creates the processed mail directory if it doesn't exist
     */
    private ensureProcessedPath(): void {
        fs.mkdirSync(this.processedPath, { recursive: true });
    }

    /**
     * Starts the mail monitoring and cleanup processes
     */
    public start(): void {
        this.log('Starting MailServerFsMount...');
        this.startWatching();
        this.startCleanupTask();
    }

    /**
     * Stops all monitoring and cleanup processes
     */
    public stop(): void {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = undefined;
        }
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = undefined;
        }
    }

    /**
     * Sets up file watchers for the mail directories
     */
    private startWatching(): void {
        this.log('Watching for new mail files on ' + this.watchPaths.join(', '));
        this.watcher = chokidar.watch(this.watchPaths, {
            persistent: true,
            ignoreInitial: false,
            depth: 0,
            awaitWriteFinish: {
                stabilityThreshold: 2000,
                pollInterval: 100,
            },
        });

        // Handle file addition events
        this.watcher.on('add', (filePath) => this.handleNewFile(filePath));
        this.watcher.on('error', (error) => this.emit('error', error));
    }

    /**
     * Processes a newly detected mail file
     * @param filePath Path to the new mail file
     */
    private async handleNewFile(filePath: string): Promise<void> {
        const filename = path.basename(filePath);
        this.log('New mail file detected: ' + filename);

        if (this.isMailFile(filename) && !this.isAlreadyProcessed(filename)) {
            this.processedFiles.add(filename); // Mark as processed
            try {
                const rawEmail = await this.readFileAsync(filePath);
                await this.processMail(rawEmail, async () => {
                    await this.moveToProcessed(filePath, filename);
                    // Remove the file from the processed set after 5 seconds
                    setTimeout(() => this.processedFiles.delete(filename), 5000);
                });
                this.emit('processed', filename);
            } catch (error) {
                this.emit('error', error);
                this.processedFiles.delete(filename); // Remove immediately on error
            }
        } else {
            this.log(`File ${filename} is already processed or invalid.`);
        }
    }

    /**
     * Determines if a file is a valid mail file based on naming pattern
     * @param filename Name of the file to check
     * @returns True if the file appears to be a valid mail file
     */
    private isMailFile(filename: string): boolean {
        return filename.split('.').length >= 3 && filename.includes(process.env.MAIL_SERVER ?? '');
    }

    /**
     * Checks if a file has already been processed to prevent duplicates
     * @param filename Name of the file to check
     * @returns True if the file has already been processed
     */
    private isAlreadyProcessed(filename: string): boolean {
        return this.processedFiles.has(filename);
    }

    /**
     * Reads a file asynchronously and returns its contents as a Buffer
     * @param filePath Path to the file to read
     * @returns Promise resolving to the file contents as a Buffer
     */
    private readFileAsync(filePath: string): Promise<Buffer> {
        return fs.promises.readFile(filePath);
    }

    /**
     * Processes a mail and executes the success callback when complete
     * @param rawEmail Raw email data as a Buffer
     * @param onSuccess Callback to execute after successful processing
     * @returns Promise that resolves when processing is complete
     */
    private async processMail(rawEmail: Buffer, onSuccess: VoidCallback): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const startTime = Date.now(); // Capture start time for processing

            this.onReceived(rawEmail, () => {
                try {
                    onSuccess();
                    const endTime = Date.now(); // Capture end time for processing
                    const processingTime = endTime - startTime;
                    this.log(`Mail processed in ${processingTime}ms`);
                    resolve();
                } catch (err) {
                    reject(err);
                }
            });
        });
    }

    /**
     * Abstract method to process the raw email.
     * Must be implemented in the derived class.
     * @param raw Raw email as a Buffer
     * @param onSuccess Callback to be called on successful processing
     */
    protected abstract onReceived(raw: Buffer, onSuccess: VoidCallback): void;

    /**
     * Moves a processed mail file to the .Processed directory
     * @param originalPath Original path of the mail file
     * @param filename Name of the mail file
     */
    private async moveToProcessed(originalPath: string, filename: string): Promise<void> {
        const destinationPath = path.join(this.processedPath, filename);
        await renameAsync(originalPath, destinationPath);
    }

    /**
     * Starts the periodic task to clean up old processed emails
     */
    private startCleanupTask(): void {
        this.cleanupInterval = setInterval(() => {
            this.cleanupProcessedEmails().catch((error) => {
                this.emit('error', error);
            });
        }, this.cleanupIntervalMs);
    }

    /**
     * Removes processed emails that are older than the specified age limit
     */
    private async cleanupProcessedEmails(): Promise<void> {
        const files = await readdirAsync(this.processedPath);
        const now = Date.now();

        for (const file of files) {
            if (this.isMailFile(file)) {
                const filePath = path.join(this.processedPath, file);
                const stats = await statAsync(filePath);
                if (now - stats.mtimeMs > this.fileAgeLimitMs) {
                    await unlinkAsync(filePath);
                    this.emit('deleted', file);
                }
            }
        }
    }
    /**
     * Logging method for events, can be overridden in the derived class.
     * @param message Message to log
     */
    protected log(message: string): void {
        console.log('MailServerFsMount:', message);
    }
}

export default MailServerFsMount;
