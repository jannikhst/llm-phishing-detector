import { Router } from 'express';
import { getReport } from '../controllers/analyze.controller';

/**
 * Router for email analysis endpoints
 * Handles routes for analyzing email files and generating security reports
 */
export const analyzeRouter = Router();

// POST /analyze - Analyze an uploaded email file and return a security report
analyzeRouter.post('/', getReport);
