import { GoogleGenAI } from '@google/genai';
import { retryWithBackoff } from './routerAgent.js';

let ai = null;
function getAI() {
    if (!ai) ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    return ai;
}

const INFRA_EXPERT_PROMPT = (url, toolData) => `
You are a specialized Infrastructure & Cloud Security Expert Bug Hunter focused on server configuration, TLS, HTTP headers, and server-side misconfiguration. Every finding must reference real evidence.

## Target
URL: ${url}

## Security Headers Analysis
${JSON.stringify(toolData.headers, null, 2)}

## SSL/TLS Analysis
${JSON.stringify(toolData.ssl, null, 2)}

## Server Information Disclosure
Disclosed headers: ${JSON.stringify(toolData.headers?.disclosures || [])}

## Your Task
Write ONLY the sections below with specific evidence references.

### INFRASTRUCTURE SECURITY FINDINGS

For each finding:
**[SEVERITY]** Finding Title
- **Evidence**: The specific header/certificate data proving this issue
- **CWE**: CWE-XXX
- **Impact**: What an attacker gains
- **CVSS Estimate**: X.X
- **Fix**: Exact configuration snippet (nginx/apache/IIS format where applicable)

### SECURITY HEADER SCORECARD
Rate the overall header security posture: A/B/C/D/F with reasoning.

### TLS/SSL POSTURE
Summarize certificate and protocol health.

### INFORMATION DISCLOSURE ASSESSMENT
Evaluate what server/technology info is being leaked via response headers.
`;

export async function runInfraExpert(url, scrapedData, toolResults) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.includes('dummy') || apiKey.includes('your_')) {
        return '### INFRASTRUCTURE FINDINGS\n_No valid API key — skipped._';
    }

    const ai = getAI();
    const prompt = INFRA_EXPERT_PROMPT(url, toolResults);

    return retryWithBackoff(async () => {
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });
        return response.text;
    });
}
