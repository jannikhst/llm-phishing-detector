import { MailCheckProcessor } from "./mails/mailcheck_processor";
import path from 'path';
import express from 'express';
import cors from 'cors';
import { router } from './http/routes';

/**
 * Main application entry point
 * Sets up the Express server with middleware, routes, and starts the mail processor
 */

// Initialize Express application
const app = express();

// Configure middleware
app.use(cors());
app.use(express.json());

// Serve static files from the public directory
const publicPath = path.join(__dirname, '..', 'data', 'public');
app.use(express.static(publicPath, {
    extensions: ['html']
}));

// Register API routes
app.use('/', router);

// Set server port from environment variable or default to 3000
const port = process.env.PORT || 3000;

/**
 * Initializes and starts the mail processing service
 * This monitors the mailserver directory for incoming emails
 */
function main() {
    console.log('Starting MailCheckProcessor...');
    const processor = new MailCheckProcessor(path.join(__dirname, '..', 'data', 'mailserver', 'start'));
    processor.start();
}

// Start the server and initialize the mail processor
app.listen(port, () => {
    main();
    console.log(`Server running on port ${port}`);
});
