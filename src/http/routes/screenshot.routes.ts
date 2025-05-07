import { Router } from 'express';
import { getScreenshot } from '../controllers/screenshot.controller';

/**
 * Router for screenshot endpoints
 * Handles routes for retrieving website screenshots by UUID
 */
export const screenshotRouter = Router();

// GET /screenshot/:uuid - Get a website screenshot by its UUID
screenshotRouter.get('/:uuid', getScreenshot);
