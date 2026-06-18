/**
 * Code Rakshak — Report Synthesizer
 * Combines all agent outputs into a structured, comprehensive final report.
 */

import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();const SYSTEM_PROMPT = `You are the Chief Code Analyst at Code Rakshak. Your job is to write a comprehensive code analysis report that can be easily understood by BOTH a professional developer and a normal non-technical person.

STRICT RULES FOR YOUR REPORT:
1. Write in plain, clear, and professional English. Avoid confusing jargon (e.g., do NOT use raw academic or software version terms like "alpha", "beta" etc. unless clearly explained for a layperson). If you must use a technical term, explain it simply in brackets.
2. Ensure the report is highly detailed and comprehensive. Do not summarize or skip issues; mention every single mistake, bug, vulnerability, or area of improvement detected.
3. For every single issue/mistake found, clearly list:
   - WHAT the mistake is
   - WHY it is bad (its impact and danger)
   - PROS and CONS (the positive aspects of the current code, the downsides/risks of leaving it as is, and the pros/cons of the proposed fix)
   - HOW to fix it (with a clear code example showing BEFORE vs. AFTER)
4. Use emoji bullets (🔴 🟠 🟡 🟢 ✅) to make severity levels immediately obvious.
5. Provide a clear balance: highlight both positive points (what the developer did well, i.e., the "pros" of their implementation) and negative points (the "cons").
6. Avoid complex or confusing phrasing. Keep it simple yet thorough and highly detailed.
7. End with an encouraging, positive note.

Your tone: friendly senior developer helping a teammate, providing clear and actionable guidance.`;

export async function synthesizeReport(parsedCode, agentOutputs, scores) {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey.includes('your_') || apiKey.includes('dummy')) {
        return generateFallbackReport(parsedCode, agentOutputs, scores);
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `Write a Code Rakshak report for the following code analysis results.
Remember: write in plain English that BOTH a professional and a normal person can understand. No raw jargon or confusing version terms like alpha/beta.

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
Write a detailed summary of 3-4 sentences in plain English explaining the overall security and quality state. Mention the biggest positives (pros) and the main concerns (cons).

## 📊 Your Scores
Show the scores in a simple table. Add one plain-English sentence explaining what each score means for this specific code.

## 🔴 Serious Mistakes & Vulnerabilities — Fix These First
For each critical/high issue found, provide complete details:
- **Mistake:** [Explain what the mistake is in simple terms]
- **Why it's dangerous (Cons of current code):** [Explain the security threat or impact]
- **Pros & Cons of fixing:** [What are the benefits of fixing it, and what are any downsides or effort involved?]
- **How to fix it:** [Clear step-by-step instructions. Provide BEFORE (bad code) and AFTER (fixed code) code blocks]

## 🟡 Smaller Mistakes & Quality Issues
For each medium issue:
- **Mistake:** [Explain it simply]
- **Why it's bad:** [Explain the impact]
- **Pros & Cons of fixing:** [Explain pros and cons of fixing it]
- **How to fix it:** [Show BEFORE and AFTER code blocks]

## 🔵 Minor Polish & Observations
List low-priority issues or minor cleanups with:
- **Mistake:** [Description]
- **Impact & Fix:** [Brief description]

## ⚖️ General Pros & Cons of the Current Code
List overall architectural pros and cons of the scanned codebase:
- **Pros (Strengths):** [List at least 3 strengths in detail]
- **Cons (Weaknesses):** [List at least 3 weaknesses/risks in detail]

## 🔧 Your Action Plan (Do This In Order)
Number all fixes in priority order. Each one should be one clear sentence.

## ✅ What You Did Well
List 2–4 genuine positives. Be specific, not generic.

## 💪 Final Word
One encouraging paragraph. Acknowledge the effort and point to the next step.

---
Keep every section highly detailed and thorough. Mention every single mistake found in the input data.`;

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

## 👀 What Did We Find? (Quick Summary)
Code Rakshak has completed analysis of **${parsedCode.filename}** (${parsedCode.detectedLanguage}). 
- **Pros (Strengths):** The codebase is defined using ${parsedCode.detectedLanguage}. Its cyclomatic complexity is currently at ${parsedCode.metrics.cyclomaticComplexity}.
- **Cons (Weaknesses):** ${scores.vulnerabilityCount.total > 0
    ? `We detected ${scores.vulnerabilityCount.total} potential issues: ${scores.vulnerabilityCount.critical} critical, ${scores.vulnerabilityCount.high} high, ${scores.vulnerabilityCount.medium} medium, and ${scores.vulnerabilityCount.low} low severity issues.`
    : `No obvious security red flags were detected by the patterns scanner.`}

---

## 📊 Scores & Grade

| Metric | Score | Status |
|--------|-------|--------|
| 🔒 **Strength Score** (Security) | **${scores.strengthScore}/100** | ${scores.strengthScore >= 80 ? '✅ Strong' : scores.strengthScore >= 60 ? '⚠️ Moderate' : '❌ Weak'} |
| ⚖️ **Fairness Score** (Quality) | **${scores.fairnessScore}/100** | ${scores.fairnessScore >= 80 ? '✅ Good' : scores.fairnessScore >= 60 ? '⚠️ Moderate' : '❌ Poor'} |
| 🎯 **Overall Grade** | **${scores.grade}** | ${scores.gradeLabel} |

${gradeEmoji[scores.grade] || '📋'} **Grade: ${scores.grade} — ${scores.gradeLabel}**

---

## 🔴 Serious Mistakes & Vulnerabilities — Fix These First
${scores.vulnerabilityCount.critical + scores.vulnerabilityCount.high === 0 ? '_No critical or high issues found._' : ''}
${(parsedCode.redFlags || []).filter(f => f.severity === 'critical' || f.severity === 'high').map(flag => `
- **Mistake:** ${flag.name}
- **Why it's dangerous (Cons of current code):** Pattern detected: \`${flag.sample}\`. This critical code pattern poses serious risks to security, potentially exposing credentials or enabling injection attacks.
- **Pros & Cons of fixing:**
  - **Pros:** Prevents security breaches and secures sensitive data.
  - **Cons (Effort):** Requires updating the configuration file/environment to load values securely.
- **How to fix it:** Replace hardcoded credentials or bad patterns with secure configurations (e.g. environment variables or parameterized queries).
`).join('\n')}

---

## 🟡 Smaller Mistakes & Quality Issues
${scores.vulnerabilityCount.medium === 0 ? '_No medium issues found._' : ''}
${(parsedCode.redFlags || []).filter(f => f.severity === 'medium').map(flag => `
- **Mistake:** ${flag.name}
- **Why it's bad:** Pattern detected: \`${flag.sample}\`. This can result in code instability or minor exposure issues.
- **Pros & Cons of fixing:**
  - **Pros:** Enhances stability and overall maintainability.
  - **Cons (Effort):** Minor refactoring effort required.
- **How to fix it:** Refactor the target code pattern to follow language-specific best practices.
`).join('\n')}

---

## 🔵 Minor Polish & Observations
${scores.vulnerabilityCount.low === 0 ? '_No low issues found._' : ''}
${(parsedCode.redFlags || []).filter(f => f.severity === 'low').map(flag => `
- **Mistake:** ${flag.name}
- **Impact & Fix:** Low impact. Clean up the matching pattern: \`${flag.sample}\`.
`).join('\n')}

---

## ⚖️ General Pros & Cons of the Current Code
- **Pros (Strengths):**
  1. The code utilizes ${(parsedCode.detectedLanguage || 'Unknown').toUpperCase()} structure correctly.
  2. Syntactic pre-screening succeeded.
  3. Cycle complexity is at a baseline level of ${parsedCode.metrics.cyclomaticComplexity}.
- **Cons (Weaknesses):**
  1. The scanner identified ${scores.vulnerabilityCount.total} potential issue(s).
  2. Comment ratio is ${parsedCode.metrics.commentRatio}%, which might limit developer onboarding readability.

---

## 🔧 Your Action Plan (Do This In Order)
${scores.vulnerabilityCount.critical > 0 ? '1. **[IMMEDIATE]** Fix all CRITICAL security vulnerabilities.' : ''}
${scores.vulnerabilityCount.high > 0 ? '2. **[HIGH PRIORITY]** Address HIGH severity issues.' : ''}
${scores.strengthScore < 70 ? '3. **[SECURITY]** Implement proper input validation and error handling.' : ''}
${parsedCode.metrics.commentRatio < 10 ? '4. **[QUALITY]** Add documentation to reach a healthy comment ratio.' : ''}
${parsedCode.metrics.cyclomaticComplexity > 15 ? '5. **[REFACTOR]** Reduce complexity by modularizing long code blocks.' : ''}
6. Conduct peer review before staging deployments.

---

This report was generated by **Code Rakshak** — your code's guardian. Address the findings above to strengthen your code's security and quality. Re-run the analysis after making improvements to track your progress.

*Note: AI-enhanced security analysis requires a valid Gemini API key for deeper vulnerability detection.*`;
}
