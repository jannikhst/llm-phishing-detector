import { Router } from 'express';
import { explainRouter } from './explain.routes';
import { analyzeRouter } from './analyze.routes';
import { screenshotRouter } from './screenshot.routes';
import { postFeedback } from '../controllers/feedback.controller';
import { getReport, postPersistReport } from '../controllers/persist.controller';

/**
 * Main router that combines all application routes
 * Configures all API endpoints for the application
 */
export const router = Router();

// Mount sub-routers
router.use('/explain', explainRouter);    // Term explanation routes
router.use('/analyze', analyzeRouter);    // Email analysis routes
router.use('/screenshot', screenshotRouter); // Screenshot serving routes

// Direct routes
router.post('/feedback', postFeedback);      // Submit user feedback
router.post('/persist', postPersistReport);  // Save analysis report
router.get('/persist/:uuid', getReport);     // Retrieve saved report by UUID
