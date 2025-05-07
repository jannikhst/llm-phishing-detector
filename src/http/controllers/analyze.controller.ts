import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import NodeCache from 'node-cache';
import { EmlData } from '../../mails/eml_parser';
import { TestSuiteRunner } from '../../tests/test_suite_runner';
import { HttpAccessLogger } from '../../config/logger/http_access';

/**
 * This controller handles the analysis of email files (.eml)
 * It processes uploaded files, runs security tests, and returns a comprehensive report
 * Includes rate limiting, caching, and file cleanup mechanisms
 */

// Create NodeCache instance
// stdTTL = 5h (in seconds), checkperiod = every 600s (10min)
const cache = new NodeCache({ stdTTL: 5 * 60 * 60, checkperiod: 600 });

// Configure Multer for file uploads
const upload = multer({
    storage: multer.diskStorage({
        destination: async function (req, file, cb) {
            const uploadPath = path.join(__dirname, '..', 'data', 'tmp', 'uploads');
            await fs.mkdir(uploadPath, { recursive: true });
            cb(null, uploadPath);
        },
        filename: function (req, file, cb) {
            cb(null, Date.now() + '-' + file.originalname);
        }
    }),
    fileFilter: function (req, file, cb) {
        const filetypes = /\.eml$/i;
        const mimetype = file.mimetype === 'message/rfc822';
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only .eml files are allowed'));
    },
    limits: { fileSize: 35 * 1024 * 1024 } // 35MB size limit
}).single('emlFile');

/**
 * Handles the POST request to analyze an email file
 * Processes the uploaded file, performs security checks, and returns analysis results
 * @param req Express request object containing the uploaded file
 * @param res Express response object
 */
export function getReport(req: Request, res: Response) {
    const logger = new HttpAccessLogger();
    // First, handle the file upload
    upload(req, res, async function (err) {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ error: err.message });
        } else if (err) {
            return res.status(400).json({ error: err.message });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        const start = Date.now();
        let ip = req.headers['X-Real-Ip'] || req.ip;
        if (Array.isArray(ip)) {
            ip = ip[0];
        }
        try {
            // Read the file as a buffer
            const emlBuffer = await fs.readFile(req.file.path);

            // Generate a hash of the file content (SHA-256)
            const fileHash = crypto.createHash('sha256').update(emlBuffer).digest('hex');
            const cacheKey = `analysis_${fileHash}`;

            // 1. Check cache for existing analysis
            const cachedResult = cache.get(cacheKey);
            if (cachedResult) {
                // If a result is in the cache, return it directly
                // -> No rate limit deduction since "old" requests are allowed
                await fs.unlink(req.file.path); // File can be deleted
                return res.json(cachedResult);
            }

            // Maximum 5 requests per IP per day
            const requestCountKey = `requests_${ip}`;
            const currentRequestCount = cache.get<number>(requestCountKey) || 0;

            if (currentRequestCount >= 5) {
                // File is not needed -> delete it
                await fs.unlink(req.file.path);
                return res.status(429).json({ error: 'You have already checked 5 emails today, please try again tomorrow.', ip: ip });
            }

            // Increment counter and cache it for 24 hours
            cache.set<number>(requestCountKey, currentRequestCount + 1, 24 * 60 * 60);

            // 3. Now that rate limiting is checked, perform the analysis
            const emlFile = await EmlData.fromBuffer(emlBuffer);
            if (!emlFile) {
                await fs.unlink(req.file.path);
                return res.status(400).json({ error: 'Invalid EML file' });
            }

            const { header, link, llm } = await TestSuiteRunner.runTests(emlFile, false);

            // Create result object with all analysis data
            const result = {
                senderName: emlFile.senderName,
                senderEmail: emlFile.senderAddress,
                subject: emlFile.subject,
                maxScore: 10,
                totalScore: llm.trustPoints,
                aiAnalysis: llm,
                headerAnalysis: header,
                linkAnalysis: link,
                explanationTerms: Object.keys(TestSuiteRunner.explanationTerms).map(key => {
                    return {
                        term: key,
                        path: TestSuiteRunner.explanationTerms[key].path,
                    };
                }),
            };

            // 4. Cache the result for 5 hours
            cache.set(cacheKey, result, 5 * 60 * 60);

            // 5. Clean up the file and send the result
            await fs.unlink(req.file.path);
            res.json(result);

        } catch (error) {
            // Always clean up the file in case of errors
            await fs.unlink(req.file.path);
            console.error(error);
            res.status(500).json({ error: 'Server error processing the file: ' + error });
        } finally {
            logger.log({ ip: ip ?? 'Unknown', duration: Date.now() - start });
        }
    });
}
