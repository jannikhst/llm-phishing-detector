# MailCheck: Email Security Analysis System

![MailCheck Demo](https://raw.githubusercontent.com/jannikhst/llm-phishing-detector/main/data/public/gif/mailcheck-1.gif)

## Overview

MailCheck is a comprehensive phishing detection system developed as part of a bachelor's thesis. The system combines heuristic technical analyses with linguistic evaluation using Large Language Models (LLMs) to provide transparent, educational feedback about potential phishing threats in emails.

Unlike traditional "black box" detection systems, MailCheck focuses on providing structured, user-friendly explanations that help users understand why an email might be suspicious, thereby enhancing their cybersecurity awareness and decision-making abilities.

## Features

- **Email Header Analysis**: Examines email headers for signs of spoofing, checks sender domains against blacklists, and verifies DKIM and SPF records.
- **URL Security Checks**: Crawls and analyzes all URLs found in emails, follows redirects, and checks against known blacklists.
- **Attachment Scanning**: Scans email attachments for malware using ClamAV.
- **LLM-Based Content Analysis**: Uses AI to analyze the linguistic patterns, tone, and structure of emails for signs of phishing.
- **Educational Feedback**: Provides detailed explanations of security issues rather than simple "safe/unsafe" classifications.
- **Multi-Platform Access**: Accessible via both email submission and web interface.
- **Screenshot Capture**: Takes screenshots of linked websites for visual verification.
- **Whitelist Support**: Maintains a whitelist of trusted domains to reduce false positives.
- **Rate Limiting**: Implements rate limiting to prevent abuse of the service.

## System Architecture

The system is organized into several key components:

### Mail Processing
- `mail_server_fs_mount.ts`: Monitors filesystem for new email files
- `eml_parser.ts`: Parses email content and structure
- `mail_sender.ts`: Generates and sends security reports
- `verify.ts`: Verifies email authenticity (DKIM, SPF)
- `rate_limit.ts`: Implements rate limiting for email submissions

### URL Analysis
- `domain_checker.ts`: Checks domains against blacklists
- `url_checker.ts`: Coordinates URL security checks
- `url_crawler.ts`: Crawls websites to analyze content and follow redirects
- `whitelist.ts`: Manages whitelist of trusted domains

### Security Testing
- `header_test_suite.ts`: Tests for header-based security issues
- `link_test_suite.ts`: Tests for URL-based security issues
- `llm_test_suite.ts`: Uses AI to analyze email content
- `test_suite_runner.ts`: Coordinates all security tests

### Web Interface
- HTTP controllers and routes for web-based submissions
- Screenshot management for visual verification of websites

## Installation

### Prerequisites
- Docker and Docker Compose
- A mail server for sending/receiving emails
- An OpenRouter API key for LLM access

### Docker Compose Installation

1. Clone the repository:
   ```bash
   git clone [repository-url]
   cd mailcheck
   ```

2. Create a `.env` file with the following variables:
   ```
   # Mail server configuration
   MAIL_SERVER=your-mail-server
   MAIL_USERNAME=your-email@example.com
   MAIL_PASSWORD=your-email-password
   
   # Path to the directory where incoming emails will be stored
   MAIL_SERVER_FS=/path/to/mailserver/directory
   
   # API key for Google Safe Browsing to check URLs for malicious content
   GOOGLE_SAFE_BROWSING_API_KEY=your-google-safe-browsing-api-key
   
   # API key for OpenRouter to access various AI models
   OPENROUTER_API_KEY=your-openrouter-api-key
   ```

3. Start the application with Docker Compose:
   ```bash
   docker compose up -d
   ```
   
   This will:
   - Build the Docker image with Node.js, ClamAV, and Chromium
   - Mount the data directory for persistence
   - Configure the mail server directory
   - Start the application on port 3000

4. View logs:
   ```bash
   docker compose logs -f
   ```

5. Stop the application:
   ```bash
   docker compose down
   ```

## Usage

### Live Demo
A live demo of the system is hosted at [mailcheck.help](https://mailcheck.help). You can use this demo to test the system without installing it locally.

### Email Submission
Send an email to the configured email address. The system will analyze the email and respond with a detailed security report.

### Web Interface
1. Access the web interface at `http://localhost:3000` (or [mailcheck.help](https://mailcheck.help) for the live demo)
2. Upload an EML file for analysis
3. View the detailed security report

### API Endpoints
- `POST /analyze`: Submit an EML file for analysis
- `GET /explain/:term`: Get explanation for security terms
- `GET /screenshot/:uuid`: View screenshots of websites
- `POST /feedback`: Submit feedback about the analysis
- `POST /persist`: Save analysis results
- `GET /persist/:uuid`: Retrieve saved analysis results

## Configuration

### Whitelist Configuration
Edit `data/public/whitelist.txt` to add trusted domains that should bypass certain security checks.

### LLM Configuration
The system uses OpenRouter to access various AI models. Configure the model in `src/tests/llm_test_suite.ts`.

### ClamAV Configuration
ClamAV is used for malware scanning. Ensure it's properly installed and configured on your system.

## Development

### Project Structure
```
├── data/                  # Data files and public assets
│   ├── mailserver/        # Email storage for filesystem-based mail server
│   ├── prompts/           # LLM prompt templates
│   └── public/            # Public web assets
├── src/                   # Source code
│   ├── config/            # Configuration files
│   ├── http/              # Web interface controllers and routes
│   ├── mails/             # Email processing components
│   ├── tests/             # Security test suites
│   ├── url/               # URL analysis components
│   └── utils/             # Utility functions
├── Dockerfile             # Docker configuration
└── compose.yml            # Docker Compose configuration
```

### Data Directory Structure

The `data` directory contains several important components:

#### Mailserver Directory
The `mailserver` directory is used for the filesystem-based mail server implementation. It follows the Maildir format with subdirectories:
- `cur`: Contains current messages that have been seen
- `new`: Contains new messages that have not been seen yet
- `home`: Contains processed messages

The mailserver directory is configured in the `.env` file via the `MAIL_SERVER_FS` variable and is monitored by the system for new incoming emails.

#### Prompts Directory
The `prompts` directory contains template files used by the LLM for analysis:
- `prompt_eml.txt`: Prompt template for analyzing complete EML files
- `prompt_no_eml.txt`: Prompt template for analyzing forwarded emails without full headers

#### Public Directory
The `public` directory contains web assets and configuration files:
- `index.html`: Main landing page
- `result.html`: Template for displaying analysis results
- `how.html`: Instructions on how to use the system
- `study.html`: Information about the research study
- `feedback.js`: JavaScript for handling user feedback
- `whitelist.txt`: List of trusted domains that bypass certain security checks
- `gif/`: Directory containing tutorial GIFs demonstrating how to use the system

During runtime, the system also creates a `tmp` directory within `data` for storing:
- Screenshots of analyzed websites
- Log files
- Temporary analysis reports
- User feedback data

### Attachments Directory

The `attachments` directory contains data used directly in the bachelor's thesis:
- `raw_study_submissions.zip`: Raw data collected from the user study
- `llm_comparison.pdf`: Results of the subjective LLM comparison
- `study_analyze_helper.js`: Script used to analyze the study data

### Building
```bash
npm run build
```

## Research Background

This project was developed as part of a bachelor's thesis addressing the challenge of phishing emails, which continue to pose a significant cybersecurity risk by exploiting human vulnerabilities. Traditional detection systems often operate as black boxes, offering little transparency or educational value to users.

The system combines heuristic technical analyses (header verification, link inspection) with linguistic evaluation using LLMs. The LLM not only analyzes the general tone and structure of the email but also formulates individualized explanations and trust assessments, taking into account both language patterns and results from technical checks.

A small-scale user study was conducted to gather qualitative feedback regarding the clarity, usability, and educational impact of the generated reports. Results indicate that structured, transparent feedback can enhance user understanding of phishing risks, although further improvements are needed, particularly in simplifying technical terms and explaining scoring mechanisms.
