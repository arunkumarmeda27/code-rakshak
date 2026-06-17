/**
 * Code Rakshak — Loophole Agent
 * Finds logical bugs, edge cases, race conditions, and hidden vulnerabilities.
 */

// Smart code sampling: up to 120K chars.
// For very large files, samples from beginning, middle, AND end to get full coverage.
function prepareCodeForAI(code) {
    const MAX = 120000;
    if (code.length <= MAX) return code;
    const head   = code.substring(0, 60000);
    const midPos = Math.floor(code.length / 2);
    const middle = code.substring(midPos - 15000, midPos + 15000);
    const tail   = code.substring(code.length - 30000);
    return (
        head +
        '\n\n// ... [SECTION SKIPPED — middle portion sampled below] ...\n\n' +
        middle +
        '\n\n// ... [SECTION SKIPPED — end of file below] ...\n\n' +
        tail
    );
}

import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const SYSTEM_PROMPT = `You are an expert software debugger and logical vulnerability hunter at Code Rakshak.
Your specialty is finding "loopholes" — hidden bugs and logical flaws that aren't obvious security issues.
You analyze:
1. Off-by-one errors and boundary conditions
2. Null/undefined pointer dereferences
3. Integer overflow/underflow
4. Race conditions and concurrency issues
5. Unhandled edge cases and exceptional inputs
6. Logic errors and incorrect assumptions
7. Resource leaks (memory, file handles, connections)
8. Improper type handling and casting
9. Incorrect algorithm implementations
10. Missing input validation for business logic
11. API misuse and incorrect function calls
12. State management bugs

Think like an attacker trying to break the code through unexpected inputs or usage patterns.
Be creative — find the loopholes the developer didn't think about.

Format findings with: [BUG] [LOGICAL] [EDGE CASE] [RACE] [RESOURCE LEAK] labels.`;

export async function runLoopholeAgent(parsedCode) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.includes('your_') || apiKey.includes('dummy')) {
        return generateFallbackLoopholeAnalysis(parsedCode);
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `Hunt for loopholes, bugs, and hidden vulnerabilities in this ${parsedCode.detectedLanguage} code.

FILE: ${parsedCode.filename}
Complexity: ${parsedCode.metrics.cyclomaticComplexity}
Functions: ${parsedCode.metrics.functionCount}

CODE:
\`\`\`${parsedCode.detectedLanguage}
${prepareCodeForAI(parsedCode.code)}
\`\`\`

Think adversarially. Find:
1. What happens with null/empty/negative inputs?
2. What happens at boundary values?
3. Are there race conditions if called concurrently?
4. Any resource leaks?
5. Logic errors or wrong assumptions?
6. Off-by-one errors?
7. Missing error handling for specific paths?
8. Any scenario where this code would silently fail or produce wrong results?

For each loophole:
- Label it: [BUG] [LOGICAL] [EDGE CASE] [RACE] [RESOURCE LEAK]
- Describe the exact scenario that triggers it
- Explain the impact
- Show the fix`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: prompt,
            config: {
                systemInstruction: SYSTEM_PROMPT,
                temperature: 0.4,
                maxOutputTokens: 1500
            }
        });
        return response.text;
    } catch (error) {
        console.error('Loophole Agent error:', error.message);
        return generateFallbackLoopholeAnalysis(parsedCode);
    }
}

function generateFallbackLoopholeAnalysis(parsedCode) {
    const { metrics, redFlags, detectedLanguage } = parsedCode;
    const findings = [];

    // Check for empty catch blocks pattern
    const emptyTryCatch = redFlags.find(f => f.name.includes('Empty catch'));
    if (emptyTryCatch) {
        findings.push('[BUG] Empty catch block detected — exceptions are being silently swallowed, hiding errors from developers and users');
    }

    if (metrics.cyclomaticComplexity > 15) {
        findings.push('[EDGE CASE] High cyclomatic complexity suggests many code paths that may not all be tested — edge cases likely exist in conditional branches');
    }

    if (metrics.functionCount === 0 && metrics.lineCount > 30) {
        findings.push('[LOGICAL] No modular functions detected — logic may be tightly coupled and harder to test, increasing likelihood of untested edge cases');
    }

    if (findings.length === 0) {
        findings.push('[INFO] Basic loophole screening complete — enable AI analysis for deep logical vulnerability detection');
    }

    return `## Loophole Analysis Report

**Language:** ${detectedLanguage}
**Code Paths:** ${metrics.cyclomaticComplexity}

### Potential Loopholes:
${findings.join('\n')}

*Note: AI-enhanced loophole detection requires a valid Gemini API key for comprehensive analysis*`;
}
