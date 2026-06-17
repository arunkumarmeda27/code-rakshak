import { GoogleGenAI } from '@google/genai';
import { retryWithBackoff } from './routerAgent.js';

let ai = null;
function getAI() {
    if (!ai) ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    return ai;
}

const API_EXPERT_PROMPT = (url, scrapedData, toolData) => `
You are a specialized API Security & Authentication Expert Bug Hunter. Your focus: JWT vulnerabilities, OAuth misconfigs, API key exposure, broken object/function-level authorization (BOLA/BFLA), and authentication bypass. Be specific and evidence-driven.

## Target
URL: ${url}

## Intercepted API Calls (from page load)
${JSON.stringify(scrapedData.apiCalls || [], null, 2)}

## External Scripts (potential API SDKs)
${(scrapedData.externalScripts || []).slice(0, 10).join('\n')}

## API Endpoint Probe Results
${JSON.stringify(toolData.api, null, 2)}

## Cookie & Session Data
${JSON.stringify(toolData.cookies, null, 2)}

## Exposed Secrets Found
${JSON.stringify(scrapedData.structure?.exposedSecrets || 'None detected')}

## Form Actions (potential auth endpoints)
${JSON.stringify((scrapedData.structure?.forms || []).map(f => ({ action: f.action, method: f.method })), null, 2)}

## Your Task

### API SECURITY FINDINGS

For each finding:
**[SEVERITY]** Finding Title
- **Evidence**: Specific data from above proving this issue
- **CWE**: CWE-XXX  
- **OWASP API Top 10**: API1-API10
- **Attack Scenario**: Step-by-step exploitation narrative
- **Fix**: Concrete remediation

### AUTHENTICATION ASSESSMENT
Evaluate login form security, session management, and token handling.

### AUTHORIZATION TESTING POINTS
List specific API endpoints or parameters that should be tested for IDOR/BOLA.

### SECRETS MANAGEMENT ASSESSMENT
Evaluate how credentials and API keys are handled.
`;

export async function runApiExpert(url, scrapedData, toolResults) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.includes('dummy') || apiKey.includes('your_')) {
        return '### API SECURITY FINDINGS\n_No valid API key — skipped._';
    }

    const ai = getAI();
    const prompt = API_EXPERT_PROMPT(url, scrapedData, toolResults);

    return retryWithBackoff(async () => {
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });
        return response.text;
    });
}
