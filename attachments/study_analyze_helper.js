/**
 * Study Analysis Helper
 * 
 * This script analyzes JSON feedback data collected from the user study for the MailCheck system.
 * It processes feedback submissions, calculates statistics, and generates a comprehensive report
 * including means, medians, correlations, and text feedback analysis.
 * 
 * The script expects JSON files in the './feedback' directory, each containing a user's feedback.
 */

const fs = require('fs');
const path = require('path');

//=============================================================================
// STATISTICAL UTILITY FUNCTIONS
//=============================================================================

/**
 * Calculates the median value from an array of numbers
 * @param {number[]} values - Array of numeric values
 * @returns {number} The median value
 */
function calculateMedian(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2;
    } else {
        return sorted[mid];
    }
}

/**
 * Calculates the arithmetic mean (average) from an array of numbers
 * @param {number[]} values - Array of numeric values
 * @returns {number} The mean value
 */
function calculateMean(values) {
    const sum = values.reduce((acc, val) => acc + val, 0);
    return sum / values.length;
}

/**
 * Counts the frequency of each unique value in an array
 * Used for analyzing categorical (enum) data
 * @param {string[]} values - Array of string values
 * @returns {Object} Object with counts for each unique value
 */
function countEnumValues(values) {
    const count = {};
    values.forEach(value => {
        if (typeof value === 'string' && value.length <= 20) {
            count[value] = (count[value] || 0) + 1;
        }
    });
    return count;
}

/**
 * Calculates the Pearson correlation coefficient between two arrays
 * Measures the linear relationship between two variables (-1 to 1)
 * @param {number[]} xArray - First array of numeric values
 * @param {number[]} yArray - Second array of numeric values
 * @returns {number} Correlation coefficient (-1 to 1)
 */
function correlationCoefficient(xArray, yArray) {
    if (xArray.length !== yArray.length || xArray.length === 0) {
        return NaN;
    }
    const n = xArray.length;
    const meanX = calculateMean(xArray);
    const meanY = calculateMean(yArray);

    let numerator = 0;
    let denomX = 0;
    let denomY = 0;

    for (let i = 0; i < n; i++) {
        const xDiff = xArray[i] - meanX;
        const yDiff = yArray[i] - meanY;
        numerator += xDiff * yDiff;
        denomX += xDiff * xDiff;
        denomY += yDiff * yDiff;
    }

    return numerator / Math.sqrt(denomX * denomY);
}

//=============================================================================
// MAIN PROCESSING FUNCTION
//=============================================================================

/**
 * Processes all JSON feedback files in the specified directory
 * Extracts data, calculates statistics, and prints analysis results
 * @param {string} directory - Path to the directory containing JSON feedback files
 */
function processJsonFiles(directory) {
    // Find all JSON files in the directory
    const jsonFiles = fs.readdirSync(directory).filter(file => file.endsWith('.json'));
    console.log('Gefundene JSON-Dateien:', jsonFiles);

    //-------------------------------------------------------------------------
    // Data collection structures
    //-------------------------------------------------------------------------
    
    // For storing numeric values (except participant data fields)
    const allValues = {};      // Key: field name, Value: array of numeric values
    
    // For storing categorical/enum values
    const allEnums = {};       // Key: field name, Value: array of string values
    
    // For storing longer text feedback
    const textFeedback = {};   // Key: field name, Value: array of text responses
    
    // For tracking unique participants
    const ids = new Set();     // Set of unique user IDs

    // Arrays for rating scale values (rs_* fields)
    const emailTrustValues = [];     // Values for rs_email_trust
    const feedbackTrustValues = [];  // Values for rs_feedback_trust
    const supportValues = [];        // Values for rs_support
    const trustDataByFile = [];      // Detailed data per file for these fields
    
    // For participant data fields (pe_*) - only one entry per user
    // Structure: { userId: { pe_age: value, pe_knowledge: value, ... } }
    const peUserValues = {};

    //-------------------------------------------------------------------------
    // Process each JSON file
    //-------------------------------------------------------------------------
    jsonFiles.forEach(file => {
        const filePath = path.join(directory, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

        // Remove large email report data to focus on feedback
        delete data.emailReport;

        // Create a unique user ID from participant data fields
        // This helps identify multiple submissions from the same participant
        const userId = (data.pe_age + data.pe_knowledge + data.pe_emails_received + '-' + data.pe_emails_sent);
        ids.add(userId);

        // Initialize participant data storage if this is first submission from this user
        if (!peUserValues[userId]) {
            peUserValues[userId] = {};
        }

        //---------------------------------------------------------------------
        // Extract rating scale values (rs_* fields)
        //---------------------------------------------------------------------
        let emailTrust = 0;
        let feedbackTrust = 0;
        let support = 0;
        
        // Parse email trust rating (how much they trust the analyzed email)
        if (data.rs_email_trust && !isNaN(Number(data.rs_email_trust))) {
            emailTrust = Number(data.rs_email_trust);
        }
        
        // Parse feedback trust rating (how much they trust the system's analysis)
        if (data.rs_feedback_trust && !isNaN(Number(data.rs_feedback_trust))) {
            feedbackTrust = Number(data.rs_feedback_trust);
        }
        
        // Parse support rating (how helpful the system was)
        if (data.rs_support && !isNaN(Number(data.rs_support))) {
            support = Number(data.rs_support);
        }
        
        // Store values in arrays for statistical analysis
        emailTrustValues.push(emailTrust);
        feedbackTrustValues.push(feedbackTrust);
        supportValues.push(support);

        // Store detailed data for per-file analysis
        trustDataByFile.push({
            file,               // Filename for reference
            userId,             // User ID for tracking multiple submissions
            rs_email_trust: emailTrust,
            rs_feedback_trust: feedbackTrust,
            rs_support: support
        });

        //---------------------------------------------------------------------
        // Process all fields in the JSON data
        //---------------------------------------------------------------------
        for (const key in data) {
            let value = data[key];

            // Convert numeric strings to actual numbers
            if (typeof value === 'string') {
                if (value.trim() !== '') {
                    const numericValue = Number(value);
                    if (!isNaN(numericValue)) {
                        value = numericValue;
                    }
                }
            }

            // Handle participant data fields (pe_*)
            // These are stored once per user to avoid duplicates
            if (key.startsWith('pe_')) {
                if (!(key in peUserValues[userId])) {
                    // Special handling for pe_knowledge which is categorical
                    if (key === 'pe_knowledge') {
                        peUserValues[userId][key] = value;
                    } 
                    // For other pe_* fields, only store if numeric
                    else if (typeof value === 'number' && !isNaN(value)) {
                        peUserValues[userId][key] = value;
                    }
                }
                continue; // Skip to next field after handling pe_* fields
            }

            // Store numeric values (for non-pe_* fields)
            if (typeof value === 'number' && !isNaN(value)) {
                if (!allValues[key]) {
                    allValues[key] = [];
                }
                allValues[key].push(value);
            }

            // Store categorical/enum values (short strings)
            if (typeof data[key] === 'string' &&
                data[key].length <= 25 &&
                data[key].length !== 0 &&
                isNaN(Number(data[key]))
            ) {
                if (!allEnums[key]) {
                    allEnums[key] = [];
                }
                allEnums[key].push(data[key]);
            }

            // Store longer text responses (feedback, comments, etc.)
            if (typeof data[key] === 'string' && data[key].length > 20) {
                if (!textFeedback[key]) {
                    textFeedback[key] = [];
                }
                textFeedback[key].push(data[key]);
            }
        }
    }); // End of forEach loop for JSON files

    //-------------------------------------------------------------------------
    // Aggregate participant data (pe_* fields) - one entry per user
    //-------------------------------------------------------------------------
    const aggregatedPeValues = {};
    for (const userId in peUserValues) {
        const userData = peUserValues[userId];
        for (const key in userData) {
            if (!aggregatedPeValues[key]) aggregatedPeValues[key] = [];
            aggregatedPeValues[key].push(userData[key]);
        }
    }

    //=========================================================================
    // RESULTS OUTPUT
    //=========================================================================
    
    //-------------------------------------------------------------------------
    // Basic participant information
    //-------------------------------------------------------------------------
    console.log('\n--------------------------');
    console.log(`Anzahl eindeutiger User-IDs: ${ids.size}`);
    console.log('--------------------------\n');

    //-------------------------------------------------------------------------
    // Statistics for numeric fields (excluding participant data)
    //-------------------------------------------------------------------------
    console.log('Statistiken für numerische Felder (ohne pe_-Felder):');
    for (const key in allValues) {
        const values = allValues[key];
        const mean = calculateMean(values);
        const median = calculateMedian(values);
        console.log(`Schlüssel: ${key}`);
        console.log(`  Mittelwert: ${mean.toFixed(2)}`);
        console.log(`  Median: ${median}`);
        console.log('--------------------------');
    }

    //-------------------------------------------------------------------------
    // Statistics for participant data fields (pe_*)
    //-------------------------------------------------------------------------
    console.log('\nStatistiken für pe_-Felder (pro eindeutigen User):');
    for (const key in aggregatedPeValues) {
        const values = aggregatedPeValues[key];
        
        // Handle numeric participant data
        if (typeof values[0] === 'number') {
            const mean = calculateMean(values);
            const median = calculateMedian(values);
            console.log(`Schlüssel: ${key}`);
            console.log(`  Mittelwert: ${mean.toFixed(2)}`);
            console.log(`  Median: ${median}`);
        } 
        // Handle categorical participant data
        else {
            const enumCounts = countEnumValues(values);
            console.log(`Schlüssel: ${key} (enum)`);
            console.log('  Enum-Werte und Häufigkeiten:');
            for (const enumValue in enumCounts) {
                console.log(`    ${enumValue}: ${enumCounts[enumValue]} Mal`);
            }
        }
        console.log('--------------------------');
    }

    //-------------------------------------------------------------------------
    // Statistics for categorical/enum fields
    //-------------------------------------------------------------------------
    console.log('\nStatistiken für potenzielle Enum-Felder:');
    for (const key in allEnums) {
        const enumCounts = countEnumValues(allEnums[key]);
        console.log(`Schlüssel: ${key}`);
        console.log('  Enum-Werte und Häufigkeiten:');
        for (const enumValue in enumCounts) {
            console.log(`    ${enumValue}: ${enumCounts[enumValue]} Mal`);
        }
        console.log('--------------------------');
    }

    //-------------------------------------------------------------------------
    // Detailed analysis of key rating fields by file
    //-------------------------------------------------------------------------
    console.log('\nEinzelauswertung der drei Schlüssel (pro Datei):');
    trustDataByFile.forEach(entry => {
        console.log(`  Datei: ${entry.file}`);
        console.log(`    User-ID:            ${entry.userId}`);
        console.log(`    rs_support:         ${entry.rs_support}`);
        console.log(`    rs_email_trust:     ${entry.rs_email_trust}`);
        console.log(`    rs_feedback_trust:  ${entry.rs_feedback_trust}`);
        console.log('    ---');
    });

    //-------------------------------------------------------------------------
    // Summary statistics for key rating fields
    //-------------------------------------------------------------------------
    console.log('\nZusammenfassende Statistik (Mittelwert / Median) für rs_support, rs_email_trust, rs_feedback_trust:');
    
    // Support rating statistics (how helpful was the system)
    const meanSupport = calculateMean(supportValues);
    const medianSupport = calculateMedian(supportValues);
    console.log('rs_support');
    console.log(`  Mittelwert: ${meanSupport.toFixed(2)}`);
    console.log(`  Median:     ${medianSupport}`);

    // Email trust rating statistics (how much they trust the analyzed email)
    const meanEmailTrust = calculateMean(emailTrustValues);
    const medianEmailTrust = calculateMedian(emailTrustValues);
    console.log('rs_email_trust');
    console.log(`  Mittelwert: ${meanEmailTrust.toFixed(2)}`);
    console.log(`  Median:     ${medianEmailTrust}`);

    // Feedback trust rating statistics (how much they trust the system's analysis)
    const meanFeedbackTrust = calculateMean(feedbackTrustValues);
    const medianFeedbackTrust = calculateMedian(feedbackTrustValues);
    console.log('rs_feedback_trust');
    console.log(`  Mittelwert: ${meanFeedbackTrust.toFixed(2)}`);
    console.log(`  Median:     ${medianFeedbackTrust}`);

    //-------------------------------------------------------------------------
    // Correlation analysis between key rating fields
    //-------------------------------------------------------------------------
    console.log('\nKorrelationen (Pearson) zwischen rs_support, rs_email_trust und rs_feedback_trust:');
    
    // Calculate Pearson correlation coefficients
    const corrSupportEmail = correlationCoefficient(supportValues, emailTrustValues);
    const corrSupportFeedback = correlationCoefficient(supportValues, feedbackTrustValues);
    const corrEmailFeedback = correlationCoefficient(emailTrustValues, feedbackTrustValues);
    
    // Output correlation results
    console.log(`  corr(rs_support, rs_email_trust)        = ${corrSupportEmail.toFixed(3)}`);
    console.log(`  corr(rs_support, rs_feedback_trust)     = ${corrSupportFeedback.toFixed(3)}`);
    console.log(`  corr(rs_email_trust, rs_feedback_trust) = ${corrEmailFeedback.toFixed(3)}`);

    //-------------------------------------------------------------------------
    // Text feedback analysis
    //-------------------------------------------------------------------------
    console.log('\nLängere Freitextfelder (Feedback, Fragen etc.):');
    for (const key in textFeedback) {
        console.log(`Feld "${key}" (${textFeedback[key].length} Einträge):`);
        textFeedback[key].forEach((txt, idx) => {
            console.log(`  ${idx + 1}. ${txt}`);
        });
        console.log('');
    }
}

// Directory path to the JSON files
const directoryPath = './feedback';
processJsonFiles(directoryPath);
