import { promises as fsPromises } from 'fs';
import * as path from 'path';

/**
 * Represents a screenshot entry with file path and expiration time
 */
interface ScreenshotEntry {
  fileName: string;    // Path to the screenshot file
  expiresAt: number;   // Unix timestamp in milliseconds when the screenshot expires
}

/**
 * Manages screenshot files with automatic expiration and cleanup
 * Tracks screenshots in a JSON file and periodically removes expired files
 */
export class ScreenshotController {
  private screenshotListPath: string;
  private screenshots: ScreenshotEntry[] = [];
  // 15 days in milliseconds
  private retentionPeriod: number = 15 * 24 * 60 * 60 * 1000;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(jsonFilePath: string) {
    this.screenshotListPath = jsonFilePath;
    this.loadScreenshotList().then(() => {
      this.startExpirationCheck();
    });
  }

  /**
   * Loads the screenshot list from the JSON file if it exists
   * Initializes with an empty list if the file doesn't exist
   */
  private async loadScreenshotList(): Promise<void> {
    try {
      await fsPromises.access(this.screenshotListPath);
      const data = await fsPromises.readFile(this.screenshotListPath, 'utf8');
      this.screenshots = JSON.parse(data) as ScreenshotEntry[];
    } catch (error) {
      // Use empty list if file doesn't exist or an error occurs
      this.screenshots = [];
    }
  }

  /**
   * Saves the current screenshot list to the JSON file
   */
  private async saveScreenshotList(): Promise<void> {
    await fsPromises.writeFile(
      this.screenshotListPath,
      JSON.stringify(this.screenshots, null, 2),
      'utf8'
    );
  }

  /**
   * Adds a new screenshot to the tracking list
   * @param fileName Path to the screenshot file
   */
  public async addScreenshot(fileName: string): Promise<void> {
    const expiresAt = Date.now() + this.retentionPeriod;
    const entry: ScreenshotEntry = { fileName, expiresAt };
    this.screenshots.push(entry);
    await this.saveScreenshotList();
  }

  /**
   * Checks for and deletes expired screenshots
   * Removes expired entries from the tracking list
   */
  public async checkAndDeleteExpired(): Promise<void> {
    const now = Date.now();
    const validScreenshots: ScreenshotEntry[] = [];

    for (const entry of this.screenshots) {
      if (entry.expiresAt <= now) {
        // File path relative to the JSON file location
        const filePath = path.resolve(path.dirname(this.screenshotListPath), entry.fileName);
        try {
          await fsPromises.unlink(filePath);
          console.log(`Screenshot ${filePath} has been deleted.`);
        } catch (err) {
          console.error(`Error deleting file ${filePath}:`, err);
        }
      } else {
        validScreenshots.push(entry);
      }
    }

    this.screenshots = validScreenshots;
    await this.saveScreenshotList();
  }

  /**
   * Loads all existing screenshots from a directory
   * Adds them to the tracking list if they're not already tracked
   * @param directoryPath Path to the directory containing screenshots
   */
  public async bulkLoadScreenshots(directoryPath: string): Promise<void> {
    try {
      const files = await fsPromises.readdir(directoryPath);
      for (const file of files) {
        const filePath = path.join(directoryPath, file);
        const stats = await fsPromises.stat(filePath);
        if (stats.isFile()) {
          // Check if the screenshot is not already in the list
          if (!this.screenshots.find(entry => entry.fileName === filePath)) {
            // Set expiration date based on file creation time
            const expiresAt = stats.birthtimeMs + this.retentionPeriod;
            // If expiration date is already passed, delete the screenshot immediately
            if (expiresAt > Date.now()) {
              this.screenshots.push({ fileName: filePath, expiresAt });
            } else {
              // Delete immediately if already expired
              await fsPromises.unlink(filePath);
              console.log(`Bulk load: File ${filePath} was deleted because it has expired.`);
            }
          }
        }
      }
      await this.saveScreenshotList();
    } catch (error) {
      console.error('Error during bulk load of screenshots:', error);
    }
  }

  /**
   * Starts a periodic task to check for expired screenshots
   * Runs once per hour by default
   */
  private startExpirationCheck(): void {
    // Check every hour
    this.checkInterval = setInterval(() => {
      this.checkAndDeleteExpired().catch((err) => {
        console.error('Error during expiration check:', err);
      });
    }, 60 * 60 * 1000);
  }

  /**
   * Stops the periodic expiration check task
   */
  public stopExpirationCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}
