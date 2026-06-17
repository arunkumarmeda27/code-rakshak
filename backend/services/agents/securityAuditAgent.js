/**
 * Code Rakshak — Security Audit Agent
 * Finds vulnerabilities: SQL injection, XSS, hardcoded secrets, OWASP Top 10 issues.
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

const SYSTEM_PROMPT = `You are a cybersecurity expert and penetration tester at Code Rakshak.
Your job is to audit code for security vulnerabilities. You look for:
1. OWASP Top 10 vulnerabilities
2. Injection attacks (SQL, Command, LDAP, XPath)
3. Broken authentication and session management
4. Sensitive data exposure (hardcoded secrets, passwords, API keys)
5. Insecure cryptography (MD5, SHA1, weak ciphers)
6. Cross-Site Scripting (XSS) and Cross-Site Request Forgery (CSRF)
7. Insecure deserialization
8. Using components with known vulnerabilities
9. Improper error handling that leaks information
10. Path traversal and file inclusion vulnerabilities

Format your findings with:
- [CRITICAL] / [HIGH] / [MEDIUM] / [LOW] severity ratings
- The specific vulnerable code pattern
- Why it's dangerous
- How to fix it

Be precise and actionable. Reference actual code patterns you see.`;

export async function runSecurityAuditAgent(parsedCode) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.includes('your_') || apiKey.includes('dummy')) {
        return generateFallbackSecurityAudit(parsedCode);
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `Perform a comprehensive security audit of this ${parsedCode.detectedLanguage} code.

FILE: ${parsedCode.filename}
PRE-SCREENED FLAGS: ${parsedCode.redFlags.map(f => `${f.name} [${f.severity}]`).join(', ') || 'None pre-screened'}

CODE:
\`\`\`${parsedCode.detectedLanguage}
${prepareCodeForAI(parsedCode.code)}
\`\`\`

Find ALL security vulnerabilities. For each finding:
1. State severity [CRITICAL/HIGH/MEDIUM/LOW]
2. Name the vulnerability type
3. Quote the vulnerable code snippet
4. Explain the attack vector
5. Provide the secure fix

Also assess: authentication flaws, authorization issues, input validation, output encoding, cryptography usage.`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: prompt,
            config: {
                systemInstruction: SYSTEM_PROMPT,
                temperature: 0.1,
                maxOutputTokens: 2000
            }
        });
        return response.text;
    } catch (error) {
        console.error('Security Audit Agent error:', error.message);
        return generateFallbackSecurityAudit(parsedCode);
    }
}

function generateFallbackSecurityAudit(parsedCode) {
    const { redFlags, detectedLanguage } = parsedCode;
    const findings = [];

    const criticalFlags = redFlags.filter(f => f.severity === 'critical');
    const highFlags = redFlags.filter(f => f.severity === 'high');
    const mediumFlags = redFlags.filter(f => f.severity === 'medium');
    const lowFlags = redFlags.filter(f => f.severity === 'low');

    for (const flag of criticalFlags) {
        findings.push(`### [CRITICAL] ${flag.name}
**Pattern detected:** \`${flag.sample}\`
**Risk:** This is a critical security vulnerability that must be fixed immediately.
**Fix:** Remove hardcoded credentials and use environment variables or a secrets manager.`);
    }

    for (const flag of highFlags) {
        findings.push(`### [HIGH] ${flag.name}
**Pattern detected:** \`${flag.sample}\`
**Risk:** High severity issue that could lead to significant security breach.
**Fix:** Review and replace this pattern with a secure alternative.`);
    }

    for (const flag of mediumFlags) {
        findings.push(`### [MEDIUM] ${flag.name}
**Pattern detected:** \`${flag.sample}\`
**Risk:** Medium severity issue. Should be addressed in next sprint.
**Fix:** Apply secure coding best practices for ${detectedLanguage}.`);
    }

    for (const flag of lowFlags) {
        findings.push(`### [LOW] ${flag.name}
**Pattern:** \`${flag.sample}\`
**Risk:** Low impact, but should be cleaned up.`);
    }

    if (findings.length === 0) {
        findings.push('### [INFO] No obvious security red flags detected by pattern scanner\nNote: Enable AI analysis for deeper vulnerability assessment.');
    }

    return `## Security Audit Report

**Findings Summary:** ${criticalFlags.length} Critical, ${highFlags.length} High, ${mediumFlags.length} Medium, ${lowFlags.length} Low

${findings.join('\n\n')}

*Note: AI-enhanced security analysis requires a valid Gemini API key for deeper vulnerability detection*`;
}
