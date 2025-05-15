import { Request, Response } from 'express';
import { TestSuiteRunner } from '../../tests/test_suite_runner';

/**
 * Controller for handling explanation term requests
 * Provides detailed explanations for security-related terms
 */

/**
 * Handles requests for term explanations
 * Renders an HTML page with the explanation for the requested term
 * @param req Express request object containing the term parameter
 * @param res Express response object
 */
export async function getExplanation(req: Request, res: Response) {
    const explanationTerms = TestSuiteRunner.explanationTerms;
    // Construct the full path from the term parameter
    const path = '/explain/' + req.params.term;
    // Find the term that matches this path
    const term = Object.keys(explanationTerms).find(term => explanationTerms[term].path === path);

    // Return 404 if no matching term is found
    if (!term) {
        return res.status(404).json({ error: 'Explanation not found' });
    }

    const explanation = explanationTerms[term].explanation;

    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${term} Explanation</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    background-color: #f4f4f4;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                }
                .explanation {
                    background: #fff;
                    border-radius: 8px;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                    padding: 20px;
                    max-width: 600px;
                    width: 100%;
                }
                .explanation h1 {
                    margin-top: 0;
                    color: #333;
                }
                .explanation p {
                    color: #555;
                    line-height: 1.6;
                }
            </style>
        </head>
        <body>
            <div class="explanation">
                <h1>${term}</h1>
                <p>${explanation}</p>
            </div>
        </body>
        </html>
    `);
}
