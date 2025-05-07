import { CustomLogger } from "../../utils/logger";

/**
 * Data structure for OpenAI API usage logging
 * Tracks model, token usage, and processing time
 */
interface OpenAiLogData {
    model: string;         // The AI model used (e.g., gpt-4o, gpt-3.5-turbo)
    input_tokens: number;  // Number of tokens in the prompt
    output_tokens: number; // Number of tokens in the response
    duration?: number;     // Optional processing time in milliseconds
}

/**
 * Logger for OpenAI API usage
 * Records model usage, token counts, and calculates estimated costs
 */
export class OpenAiLogger extends CustomLogger<OpenAiLogData> {
    private startTime: number | undefined;
    private subject: string;

    constructor(subject: string) {
        super('openai.log');
        this.subject = subject;
    }

    // Prices per model (input and output in USD per 1M tokens)
    private static PRICES: { [key: string]: { input: number, output: number } } = {
        'gpt-4o': { input: 5.00, output: 15.00 },
        'gpt-4o-mini': { input: 0.15, output: 0.60 },
        'gpt-4-turbo': { input: 10.00, output: 30.00 },
        'gpt-4': { input: 30.00, output: 60.00 },
        'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
        'google/gemini-2.0-flash-001': { input: 0.1, output: 0.4 },
    };

    async log(data: OpenAiLogData) {
        const endTime = Date.now();
        const dur = data.duration ?? endTime - (this.startTime ?? endTime);

        // Get prices for the current model
        const prices = OpenAiLogger.PRICES[data.model] || { input: 0, output: 0 };
        const inputCost = (data.input_tokens / 1_000_000) * prices.input;
        const outputCost = (data.output_tokens / 1_000_000) * prices.output;
        const totalCost = inputCost + outputCost;

        const logData = `${new Date().toISOString()} - Model: ${data.model}, Input Tokens: ${data.input_tokens.toLocaleString('de-DE')}, Output Tokens: ${data.output_tokens.toLocaleString('de-DE')}, Duration: ${dur.toLocaleString('de-DE')}ms, Estimated Cost: $${totalCost.toFixed(4)} - ${this.subject}\n`;
        await this.append(logData);
    }

    /**
     * Starts the timer for measuring API call duration
     * Call this before making the API request
     */
    startTimer() {
        this.startTime = Date.now();
    }
}
