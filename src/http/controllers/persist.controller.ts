import { Request, Response } from 'express';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';

/**
 * Controller for persisting and retrieving analysis reports
 * Provides endpoints to save reports and retrieve them by UUID
 */

// Directory where report data will be stored
const reportDir = path.resolve(__dirname, '../data/tmp/reports');

/**
 * Handles POST requests to persist an analysis report
 * Saves the report data to a JSON file with a unique UUID
 * @param req Express request object containing the report data
 * @param res Express response object
 */
export async function postPersistReport(req: Request, res: Response) {
    try {
        const uuid = uuidv4();
        const report = req.body;
        const fileName = `${uuid}.json`;
        const filePath = path.join(reportDir, fileName);
        // Create reports directory if it doesn't exist
        await fs.mkdir(reportDir, { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(report, null, 2), 'utf8');
        return res.json({ message: 'Report persisted', uuid });
    } catch (error) {
        return res.status(500).json({ error: 'Error persisting report' });
    }
}

/**
 * Handles GET requests to retrieve a previously saved report
 * Fetches the report data by its UUID
 * @param req Express request object containing the UUID parameter
 * @param res Express response object
 */
export async function getReport(req: Request, res: Response) {
    const uuid = req.params.uuid;
    const fileName = `${uuid}.json`;
    const filePath = path.join(reportDir, fileName);
    try {
        const report = await fs.readFile(filePath, 'utf8');
        return res.json(JSON.parse(report));
    } catch (error) {
        return res.status(404).json({ error: 'Report not found' });
    }
}
