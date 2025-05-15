import fs from 'fs/promises';
import path from 'path';

/**
 * Utility class for loading and manipulating prompt templates
 * Supports loading templates from files and replacing placeholder values
 */
export class PromptBuilder {
    private content: string;

    /**
     * Creates a new prompt builder with the given content
     * @param content The initial prompt template content
     */
    constructor(content: string) {
        this.content = content;
    }

    /**
     * Loads a prompt template from the filesystem
     * @param filename The name of the prompt file (without extension)
     * @returns A new PromptBuilder instance with the loaded content
     */
    static async loadFromFs(filename: string): Promise<PromptBuilder> {
        const fp = path.join(__dirname, '..', 'data', 'prompts', filename + '.txt');
        const content = await fs.readFile(fp, 'utf-8');
        return new PromptBuilder(content);
    }

    /**
     * Builds the final prompt string with all replacements applied
     * @returns The processed prompt string
     */
    build(): string {
        console.log(this.content);
        return this.content;
    }

    /**
     * Replaces a placeholder in the prompt template with a value
     * @param key The placeholder key (without {{ }})
     * @param value The value to replace the placeholder with
     * @returns This PromptBuilder instance for method chaining
     */
    replace(key: string, value: string): PromptBuilder {
        this.content = this.content.replace(`{{${key}}}`, value);
        return this;
    }
}
