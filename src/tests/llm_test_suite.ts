import { openai } from "../config/openai";
import { EmlData } from "../mails/eml_parser";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { PromptBuilder } from "../utils/prompt_loader";
import { TestSuiteRunner } from "./test_suite_runner";
import { OpenAiLogger } from "../config/logger/openai";

/**
 * Test suite for analyzing emails using AI language models
 * Performs content analysis to detect potential security threats and phishing attempts
 */
export class LlmTestSuite {
    private promptfile: string;

    /**
     * Creates a new LLM test suite with the specified prompt template
     * @param promptfile Name of the prompt template file to use
     */
    constructor(promptfile: string) {
        this.promptfile = promptfile;
    }

    /**
     * Runs AI analysis on the email content
     * @param data Object containing the email and previous analysis results
     * @returns AI analysis results including threats and trustworthiness score
     */
    public async runTests(data: { 
        input: Buffer | EmlData,           // The email data
        link_llm_data: string,             // Link analysis results
        header_llm_data: string            // Header analysis results
    }): Promise<LlmTestSuiteResult> {
        let eml = data.input instanceof Buffer ? await EmlData.fromBuffer(data.input) : data.input as EmlData;
        if (!eml) {
            return { threats: [], explanation: 'The EML file could not be read correctly.', trustworthiness: 'neutral', trustPoints: 2.5, title: 'E-Mail konnte nicht gelesen werden.' };
        }

        const openaiLogger = new OpenAiLogger(eml.subject);
        openaiLogger.startTimer();

        // Define the expected response format using Zod schema
        const LlmTestSuiteResultFormat = z.object({
            title: z.string().describe('Wenige Schlagworte die den Bericht gut beschreiben. z.B. "Verdächtiger Absender"'),
            trustworthiness: z.enum(['suspicious', 'neutral', 'trustworthy']).describe('Die Gesamteinschätzung der E-Mail'),
            trustPoints: z.number().describe('Die Anzahl der Punkte, die die E-Mail erreicht hat (0-10). 0 = "sehr verdächtig", 10 = "vertrauenswürdig"'),
            threats: z.array(z.object({
                title: z.string().describe('z.B. "Absender Name"'),
                severity: z.enum(['low', 'medium', 'high']),
                description: z.string().describe('z.B. "Der Absender Name passt nicht zur Domain"'),
            })),
            explanation: z.string().describe('Zusammenfasung der Threats und Erklärung (max. 350 Wörter), z.B. "Beim Absenden einer Mail kann der Sender selber frei wählen welcher Name zusätzlich zur Mailadresse angezeigt werden soll. ... "'),
            ...(this.promptfile === 'prompt_eml' ? {} : { senderName: z.string().describe('Der Name des Absenders'), senderAddress: z.string().email().describe('Die E-Mail-Adresse des Absenders') }),
        });

        const prompt = await PromptBuilder.loadFromFs(this.promptfile);
        prompt.replace('header_analysis', data.header_llm_data);
        prompt.replace('email_body', eml.body.getStrippedHtml());
        prompt.replace('link_analysis', data.link_llm_data);
        prompt.replace('json_schema', JSON.stringify(zodToJsonSchema(LlmTestSuiteResultFormat)));
        prompt.replace('json_example', JSON.stringify({
            title: '...',
            trustworthiness: 'neutral',
            trustPoints: 2.5,
            threats: [
                { title: '...', severity: 'low', description: '...' }
            ],
            explanation: '...',
            ...(this.promptfile === 'prompt_eml' ? {} : { senderName: '...', senderAddress: '...' }),
        } as LlmTestSuiteResult));
        prompt.replace('explanation_terms', Object.keys(TestSuiteRunner.explanationTerms).join(', '));


        // Select the AI model to use
        // const model = 'gpt-4o';
        // const model = 'gpt-4o-mini';
        const model = 'google/gemini-2.0-flash-001';  // Currently using Google's Gemini model
        const completion = await openai.chat.completions.create({
            model,
            messages: [{ role: 'user', content: prompt.build() }],
            response_format: { type: "json_object" },
            temperature: 0.8,
        });

        openaiLogger.log({
            input_tokens: completion.usage?.prompt_tokens ?? 0,
            output_tokens: completion.usage?.completion_tokens ?? 0,
            model,
        });

        const rawResult = completion.choices[0].message.content!;
        const trimmedResult = rawResult.trim();
        const jsonStart = trimmedResult.indexOf('{');
        const jsonEnd = trimmedResult.lastIndexOf('}') + 1;
        const jsonString = trimmedResult.substring(jsonStart, jsonEnd);
        const result = JSON.parse(jsonString) as LlmTestSuiteResult;
        console.log('LLM Test Suite Result:', result);
        return result;
    }

}

/**
 * Represents a security threat detected by AI analysis
 */
export interface HtmlThreat {
    title: string;                     // Brief title of the threat
    severity: 'low' | 'medium' | 'high'; // Severity level
    description: string;               // Detailed description of the threat
}

/**
 * Results of the AI analysis of an email
 */
export interface LlmTestSuiteResult {
    trustworthiness: 'suspicious' | 'neutral' | 'trustworthy'; // Overall assessment
    title: string;                     // Brief summary of the analysis
    trustPoints: number;               // Trust score (0-10)
    threats: HtmlThreat[];             // List of detected threats
    explanation: string;               // Detailed explanation of the analysis
    senderName?: string;               // Sender name (for forwarded emails)
    senderAddress?: string;            // Sender address (for forwarded emails)
}
