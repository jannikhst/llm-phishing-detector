import { Router } from 'express';
import { getExplanation } from '../controllers/explain.controller';

/**
 * Router for term explanation endpoints
 * Handles routes for retrieving explanations of security-related terms
 */
export const explainRouter = Router();

// GET /explain/:term - Get explanation for a specific security term
explainRouter.get('/:term', getExplanation);
