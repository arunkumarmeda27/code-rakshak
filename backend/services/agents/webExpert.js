import { GoogleGenAI } from '@google/genai';
import { retryWithBackoff } from './routerAgent.js';

let ai = null;
function getAI() {
    if (!ai) ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    return ai;
}

const WEB_EXPERT_PROMPT = (url, data, toolData) => `
You are a specialized Web Vulnerability Expert Bug Hunter with 15 years of experience in XSS, CSRF, IDOR, SQL injection, SSRF, and DOM attacks. You DO NOT repeat generic advice — every finding must be tied to specific evidence.

## Target
URL: ${url}
Page Title: ${data.title}

## DOM & Structure Evidence
Forms found: ${data.structure?.forms?.length || 0}
Form details: ${JSON.stringify((data.structure?.forms || []).slice(0, 5), null, 2)}
Input fields: ${JSON.stringify((data.structure?.inputs || []).slice(0, 10), null, 2)}
External links: ${(data.structure?.externalLinks || []).slice(0, 5).join(', ')}
Images without alt: ${data.structure?.imagesWithoutAlt || 0}

## XSS Tool Findings
${JSON.stringify(toolData.xss?.findings || [], null, 2)}

## HTML Excerpt (client-side code)
\`\`\`html
${data.html?.substring(0, 4000)}
\`\`\`

## Your Task
Write ONLY the sections below. Be specific, cite evidence, and provide actionable PoC where applicable.

### WEB VULNERABILITIES FOUND

For each finding use this format:
**[SEVERITY]** Finding Title
- **Evidence**: Specific element/pattern from the data above
- **CWE**: CWE-XXX
- **Impact**: Business/user impact
- **PoC/Test**: How to reproduce or test this
- **Fix**: Concrete code-level remediation

If no significant vulnerabilities found, state that with brief reasoning.

### CSRF ASSESSMENT
Evaluate CSRF protection based on forms found and any token fields.

### IDOR ASSESSMENT
Based on observed API calls and URL patterns, assess IDOR risk.
`;

export async function runWebExpert(url, scrapedData, toolResults) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.includes('dummy') || apiKey.includes('your_')) {
        return '### WEB VULNERABILITIES\n_No valid API key — skipped._';
    }

    const ai = getAI();
    const prompt = WEB_EXPERT_PROMPT(url, scrapedData, toolResults);

    return retryWithBackoff(async () => {
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });
        return response.text;
    });
}
