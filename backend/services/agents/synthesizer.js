/**
 * Code Rakshak — Report Synthesizer
 * Combines all agent outputs into a structured, comprehensive final report.
 */

import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const SYSTEM_PROMPT = `You are the Chief Code Analyst at Code Rakshak. Your job is to write a report that ANY developer can understand — even someone who is learning to code.

STRICT RULES FOR YOUR REPORT:
1. Write in plain, everyday English. Avoid jargon. If you must use a technical term, explain it in brackets.
2. Use short, simple sentences. Max 2 sentences per paragraph.
3. For every problem you find, explain: WHAT it is, WHY it's bad, and HOW to fix it — in that order.
4. Use emoji bullets (🔴 🟠 🟡 🟢 ✅) to make severity immediately obvious.
5. The "Fix It" section must show the BEFORE (bad code) and AFTER (fixed code) when possible.
6. Never say "this exhibits poor cyclomatic complexity" — say "this function is too long and confusing, break it into smaller pieces."
7. End with an encouraging, positive note — celebrate what the developer did right.

Your tone: friendly senior developer helping a teammate, not a scary security audit.`;

export async function synthesizeReport(parsedCode, agentOutputs, scores) {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey.includes('your_') || apiKey.includes('dummy')) {
        return generateFallbackReport(parsedCode, agentOutputs, scores);
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `Write a Code Rakshak report for the following code analysis results.
Remember: write in plain English that ANY developer can understand. No jargon without explanation.

## ANALYSIS DATA

**File:** ${parsedCode.filename}
**Language:** ${parsedCode.detectedLanguage}
**Size:** ${parsedCode.metrics.lineCount} lines (${parsedCode.metrics.codeLines} code lines, ${parsedCode.metrics.commentLines} comment lines)
**Functions:** ${parsedCode.metrics.functionCount} | **Classes:** ${parsedCode.metrics.classCount}
**Complexity:** ${parsedCode.metrics.cyclomaticComplexity} | **Comment ratio:** ${parsedCode.metrics.commentRatio}%

**Scores:**
- Strength Score: ${scores.strengthScore}/100
- Fairness Score: ${scores.fairnessScore}/100
- Overall Grade: ${scores.grade} — ${scores.gradeLabel}
- Problems found: ${scores.vulnerabilityCount.critical} critical, ${scores.vulnerabilityCount.high} high, ${scores.vulnerabilityCount.medium} medium, ${scores.vulnerabilityCount.low} low

**What the AI agents found:**

STRUCTURE ANALYSIS:
${agentOutputs.staticAnalysis || 'Not available'}

SECURITY AUDIT:
${agentOutputs.securityAudit || 'Not available'}

QUALITY CHECK:
${agentOutputs.quality || 'Not available'}

HIDDEN BUGS / LOOPHOLES:
${agentOutputs.loopholes || 'Not available'}

---

Now write the final plain-English report using EXACTLY this structure:

# 🛡️ Code Rakshak Report

## 👀 What Did We Find? (Quick Summary)
Write 2–3 sentences in plain English. Example: "Your code has 3 serious security problems that need fixing right away. The good news is the code is well-organized and easy to read."

## 📊 Your Scores
Show the scores in a simple table. Add one plain-English sentence explaining what each score means for this specific code.

## 🔴 Serious Problems — Fix These First
For each critical/high issue:
**Problem:** [Name it simply — e.g., "Your password is visible in the code"]
**Why it's dangerous:** [1 sentence, no jargon]
**How to fix it:** [Simple step-by-step. Show before/after code if helpful]

## 🟡 Smaller Problems — Fix When You Can
Same format as above but for medium issues. Keep it brief.

## 🔵 Minor Things — Polish Later
Quick bullet list of low-priority improvements.

## 🔧 Your Action Plan (Do This In Order)
Number the top 5–7 fixes in priority order. Each one should be one clear sentence.
Example: "1. Remove the hardcoded password on line 8 and use an environment variable instead."

## ✅ What You Did Well
List 2–4 genuine positives. Be specific, not generic.

## 💪 Final Word
One encouraging paragraph. Acknowledge the effort and point to the next step.

---
Keep every section SHORT. If a section has nothing to say, skip it. Total report should be readable in under 5 minutes.`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: prompt,
            config: {
                systemInstruction: SYSTEM_PROMPT,
                temperature: 0.3,
                maxOutputTokens: 3000
            }
        });
        return response.text;
    } catch (error) {
        console.error('Synthesizer error:', error.message);
        return generateFallbackReport(parsedCode, agentOutputs, scores);
    }
}

function generateFallbackReport(parsedCode, agentOutputs, scores) {
    const gradeEmoji = {
        'A+': '🏆', 'A': '⭐', 'B': '👍', 'C': '⚠️', 'D': '❌', 'F': '🚨'
    };

    return `# 🛡️ Code Rakshak Analysis Report

## Executive Summary

Code Rakshak has completed analysis of **${parsedCode.filename}** (${parsedCode.detectedLanguage}). 
The code contains **${parsedCode.metrics.lineCount} lines** with a cyclomatic complexity of **${parsedCode.metrics.cyclomaticComplexity}**.

${scores.vulnerabilityCount.total > 0
    ? `⚠️ **${scores.vulnerabilityCount.total} potential issues** were detected including ${scores.vulnerabilityCount.critical} critical, ${scores.vulnerabilityCount.high} high, ${scores.vulnerabilityCount.medium} medium, and ${scores.vulnerabilityCount.low} low severity items.`
    : `✅ No obvious security red flags were detected by the pattern scanner.`}

---

## 📊 Scores & Grade

| Metric | Score | Status |
|--------|-------|--------|
| 🔒 **Strength Score** | **${scores.strengthScore}/100** | ${scores.strengthScore >= 80 ? '✅ Strong' : scores.strengthScore >= 60 ? '⚠️ Moderate' : '❌ Weak'} |
| ⚖️ **Fairness Score** | **${scores.fairnessScore}/100** | ${scores.fairnessScore >= 80 ? '✅ Good' : scores.fairnessScore >= 60 ? '⚠️ Moderate' : '❌ Poor'} |
| 🎯 **Overall Grade** | **${scores.grade}** | ${scores.gradeLabel} |

${gradeEmoji[scores.grade] || '📋'} **Grade: ${scores.grade} — ${scores.gradeLabel}**

---

## 🚨 Vulnerability Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | ${scores.vulnerabilityCount.critical} |
| 🟠 High | ${scores.vulnerabilityCount.high} |
| 🟡 Medium | ${scores.vulnerabilityCount.medium} |
| 🔵 Low | ${scores.vulnerabilityCount.low} |

---

## 🔬 Static Analysis
${agentOutputs.staticAnalysis || '_Not available_'}

---

## 🔐 Security Audit
${agentOutputs.securityAudit || '_Not available_'}

---

## 📐 Quality Assessment
${agentOutputs.quality || '_Not available_'}

---

## 🕵️ Loophole Detection
${agentOutputs.loopholes || '_Not available_'}

---

## 🔧 Strengthening Roadmap

${scores.vulnerabilityCount.critical > 0 ? '1. **[IMMEDIATE]** Fix all CRITICAL security vulnerabilities — these are exploitable now' : ''}
${scores.vulnerabilityCount.high > 0 ? '2. **[HIGH PRIORITY]** Address HIGH severity issues within the next sprint' : ''}
${scores.strenghScore < 70 ? '3. **[SECURITY]** Implement proper input validation and error handling' : ''}
${parsedCode.metrics.commentRatio < 10 ? '4. **[QUALITY]** Add documentation — aim for 15-25% comment ratio' : ''}
${parsedCode.metrics.cyclomaticComplexity > 15 ? '5. **[REFACTOR]** Reduce complexity by breaking large functions into smaller ones' : ''}
6. **[TESTING]** Add unit tests for all critical functions, especially edge cases
7. **[REVIEW]** Conduct a code review with peers before deploying

---

## Conclusion

This report was generated by **Code Rakshak** — your code's guardian. Address the findings above to strengthen your code's security and quality. Re-run the analysis after making improvements to track your progress.

*For deeper AI-powered analysis, ensure your Gemini API key is configured correctly.*`;
}
