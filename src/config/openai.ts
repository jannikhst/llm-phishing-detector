import OpenAI from 'openai';

/**
 * OpenAI client configuration
 * Uses OpenRouter as a proxy to access various AI models
 * 
 * Note: This configuration uses OpenRouter instead of direct OpenAI access,
 * which allows access to multiple AI providers through a single API
 */
export const openai = new OpenAI({
    // Using OpenRouter API key instead of direct OpenAI API key
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
});
