// Smart code sampling: up to 120K chars.
// For very large files, samples from beginning, middle, AND end to get full coverage.
function prepareCodeForAI(code) {
    const MAX = 120000;
    if (code.length <= MAX) return code;

    // For huge files: take 60K from start, 30K from middle, 30K from end
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

const SYSTEM_PROMPT = `You are a senior software engineer and static code analysis expert at Code Rakshak.
Your job is to perform a deep structural analysis of code. You analyze:
1. Code structure and architecture
2. Cyclomatic complexity and cognitive complexity
3. Anti-patterns and code smells
4. Dead code and unused variables/imports
5. Function length and single responsibility violations
6. Naming conventions and readability
7. Dependency management

Format your response as a structured analysis with clear sections.
Be specific — reference actual line patterns, function names, variable names from the code.
Mark severity: [CRITICAL] [HIGH] [MEDIUM] [LOW] [INFO]`;

export async function runStaticAnalysisAgent(parsedCode) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.includes('your_') || apiKey.includes('dummy')) {
        return generateFallbackStaticAnalysis(parsedCode);
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `Perform static analysis on this ${parsedCode.detectedLanguage} code.

FILE: ${parsedCode.filename}
METRICS:
- Lines: ${parsedCode.metrics.lineCount} (Code: ${parsedCode.metrics.codeLines}, Comments: ${parsedCode.metrics.commentLines}, Blank: ${parsedCode.metrics.blankLines})
- Functions: ${parsedCode.metrics.functionCount}
- Classes: ${parsedCode.metrics.classCount}
- Cyclomatic Complexity: ${parsedCode.metrics.cyclomaticComplexity}
- Comment Ratio: ${parsedCode.metrics.commentRatio}%
- Pre-screened Red Flags: ${parsedCode.redFlags.map(f => f.name).join(', ') || 'None detected'}

CODE:
\`\`\`${parsedCode.detectedLanguage}
${prepareCodeForAI(parsedCode.code)}
\`\`\`

Analyze for: structure, complexity, anti-patterns, dead code, naming, coupling.
Provide specific findings with severity levels.`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: prompt,
            config: {
                systemInstruction: SYSTEM_PROMPT,
                temperature: 0.2,
                maxOutputTokens: 1500
            }
        });
        return response.text;
    } catch (error) {
        console.error('Static Analysis Agent error:', error.message);
        return generateFallbackStaticAnalysis(parsedCode);
    }
}

function generateFallbackStaticAnalysis(parsedCode) {
    const { metrics, redFlags, detectedLanguage } = parsedCode;
    const issues = [];

    if (metrics.cyclomaticComplexity > 20) {
        issues.push(`[HIGH] High cyclomatic complexity (${metrics.cyclomaticComplexity}) — consider breaking into smaller functions`);
    }
    if (metrics.commentRatio < 5) {
        issues.push(`[MEDIUM] Very low comment ratio (${metrics.commentRatio}%) — code lacks documentation`);
    }
    if (metrics.functionCount === 0 && metrics.lineCount > 20) {
        issues.push(`[MEDIUM] No functions detected — code may lack proper modularization`);
    }
    if (metrics.lineCount > 500) {
        issues.push(`[LOW] Large file (${metrics.lineCount} lines) — consider splitting into modules`);
    }

    for (const flag of redFlags) {
        issues.push(`[${flag.severity.toUpperCase()}] ${flag.name} detected`);
    }

    if (issues.length === 0) {
        issues.push('[INFO] Basic structural analysis complete — no major structural issues detected');
    }

    return `## Static Analysis Report

**Language:** ${detectedLanguage}
**Complexity Score:** ${metrics.cyclomaticComplexity}
**Documentation:** ${metrics.commentRatio}%

### Findings:
${issues.join('\n')}

*Note: AI-enhanced analysis requires a valid Gemini API key*`;
}
