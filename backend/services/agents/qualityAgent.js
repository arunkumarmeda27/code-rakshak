/**
 * Code Rakshak — Quality Agent
 * Evaluates code readability, maintainability, DRY principle, naming, and best practices.
 */

import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const SYSTEM_PROMPT = `You are a senior software engineer specializing in code quality and clean code practices at Code Rakshak.
Your job is to evaluate code quality. You assess:
1. Readability and clarity
2. Naming conventions (variables, functions, classes)
3. DRY principle (Don't Repeat Yourself) — duplication and repetition
4. Single Responsibility Principle adherence
5. Error handling completeness and quality
6. Code organization and structure
7. Magic numbers and hardcoded values that should be constants
8. Function/method length (should be concise)
9. Proper use of language-specific idioms and best practices
10. Test coverage hints (are functions testable?)

Rate the overall quality and provide specific, actionable improvements.
Focus on what makes code maintainable and readable for future developers.
Severity: [HIGH] must fix, [MEDIUM] should fix, [LOW] nice to fix, [GOOD] praise worthy`;

export async function runQualityAgent(parsedCode) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.includes('your_') || apiKey.includes('dummy')) {
        return generateFallbackQualityAnalysis(parsedCode);
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `Evaluate the code quality of this ${parsedCode.detectedLanguage} code.

FILE: ${parsedCode.filename}
METRICS:
- Comment ratio: ${parsedCode.metrics.commentRatio}% (ideal: 15-25%)
- Cyclomatic complexity: ${parsedCode.metrics.cyclomaticComplexity}
- Functions: ${parsedCode.metrics.functionCount}
- Lines: ${parsedCode.metrics.lineCount}

CODE:
\`\`\`${parsedCode.detectedLanguage}
${parsedCode.code.substring(0, 8000)}
\`\`\`

Evaluate:
1. Naming quality (variables, functions, classes)
2. DRY principle adherence
3. Error handling quality
4. Code organization
5. Use of ${parsedCode.detectedLanguage} best practices/idioms
6. Magic numbers and constants
7. Function size and SRP
8. Overall maintainability score (0-10)

Highlight [GOOD] things too, not just issues. Be constructive and specific.`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: prompt,
            config: {
                systemInstruction: SYSTEM_PROMPT,
                temperature: 0.3,
                maxOutputTokens: 1500
            }
        });
        return response.text;
    } catch (error) {
        console.error('Quality Agent error:', error.message);
        return generateFallbackQualityAnalysis(parsedCode);
    }
}

function generateFallbackQualityAnalysis(parsedCode) {
    const { metrics, detectedLanguage } = parsedCode;
    const issues = [];
    const positives = [];

    if (metrics.commentRatio < 5) {
        issues.push('[HIGH] Insufficient code documentation — add comments to explain complex logic');
    } else if (metrics.commentRatio >= 15) {
        positives.push('[GOOD] Well-documented code with healthy comment ratio');
    }

    if (metrics.cyclomaticComplexity > 20) {
        issues.push('[HIGH] High complexity — refactor into smaller, focused functions');
    } else if (metrics.cyclomaticComplexity <= 10) {
        positives.push('[GOOD] Manageable cyclomatic complexity');
    }

    if (metrics.functionCount > 0) {
        const avgLinesPerFunc = Math.round(metrics.codeLines / metrics.functionCount);
        if (avgLinesPerFunc > 50) {
            issues.push(`[MEDIUM] Average function length is ${avgLinesPerFunc} lines — consider breaking down large functions`);
        } else if (avgLinesPerFunc <= 20) {
            positives.push('[GOOD] Functions appear to follow single responsibility principle');
        }
    }

    return `## Code Quality Report

**Language:** ${detectedLanguage}
**Documentation:** ${metrics.commentRatio}%
**Complexity:** ${metrics.cyclomaticComplexity}

### Quality Issues:
${issues.length > 0 ? issues.join('\n') : 'No major quality issues detected'}

### Positive Observations:
${positives.length > 0 ? positives.join('\n') : 'Enable AI analysis for detailed quality assessment'}

*Note: AI-enhanced quality analysis requires a valid Gemini API key*`;
}
