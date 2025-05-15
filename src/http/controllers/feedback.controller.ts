import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';

/**
 * Interface representing the feedback form data structure
 */
interface FeedbackRequest {
    emailReport: string;        // The email report being evaluated
    pe_age: string;             // Participant's age group
    pe_knowledge: string;       // Participant's knowledge level
    pe_mailUsage: string;       // Participant's email usage frequency
    rs_clarity: string;         // Rating for report clarity
    rs_design: string;          // Rating for report design
    rs_feedback: string;        // General feedback
    rs_questions: string;       // Questions the participant had
    rs_reason: string;          // Reason for the ratings
    rs_support: string;         // Rating for how supportive the report was
    rs_email_trust: string;     // Rating for trust in the analyzed email
    rs_feedback_trust: string;  // Rating for trust in the feedback system
}

// Directory where feedback data will be stored
const feedbackDir = path.resolve(__dirname, '../data/tmp/feedback');

/**
 * Handles POST requests for user feedback
 * Saves the feedback data to a JSON file
 * @param req Express request object containing the feedback data
 * @param res Express response object
 */
export async function postFeedback(req: Request, res: Response) {
    try {
        const feedback: FeedbackRequest = req.body;

        if (!feedback.emailReport) {
            return res.status(400).json({ error: 'emailReport is required' });
        }

        // Save feedback to a timestamped JSON file
        const fileName = `${Date.now()}.json`;
        const filePath = path.join(feedbackDir, fileName);
        await fs.mkdir(feedbackDir, { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(feedback, null, 2), 'utf8');

        return res.json({ message: 'Feedback received' });
    } catch (error) {
        return res.status(500).json({ error: 'Error saving feedback' });
    }
}
