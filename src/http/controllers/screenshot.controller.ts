import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';

/**
 * Controller for serving website screenshots
 * Provides an endpoint to retrieve screenshots by UUID
 */

/**
 * Handles GET requests for website screenshots
 * Serves the screenshot image if found, or redirects to a placeholder if not
 * @param req Express request object containing the UUID parameter
 * @param res Express response object
 */
export function getScreenshot(req: Request, res: Response) {
   // Extract UUID from request parameters
   const uuid = req.params.uuid;
   // Construct the path to the screenshot file
   const screenshotPath = path.join(__dirname, '..', 'data', 'tmp', 'screenshots', uuid + '.png');

   // Attempt to read and serve the screenshot
   fs.readFile(screenshotPath)
      .then((data) => {
         // Set content type and send the image data
         res.set('Content-Type', 'image/png');
         res.send(data);
      })
      .catch((err) => {
         // If screenshot not found or expired, redirect to a placeholder image
         res.set('Content-Type', 'image/png');
         res.redirect('https://placehold.co/1920x1080?text=Screenshot+expired');
      });
}
