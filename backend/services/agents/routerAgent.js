import { GoogleGenAI } from '@google/genai';

let ai = null;
function getAI() {
    if (!ai) ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    return ai;
}

// Retry with exponential backoff
export async function retryWithBackoff(fn, maxRetries = 4, baseDelay = 10000) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            const isRateLimit = error.message && (error.message.includes('429') || error.message.includes('Quota exceeded'));
            if (isRateLimit && attempt < maxRetries) {
                // If the error asks to wait X seconds, try to parse it, otherwise do exponential
                let waitMs = baseDelay * Math.pow(2, attempt);
                const retryMatch = error.message.match(/retry in (\d+(\.\d+)?)s/i);
                if (retryMatch) {
                    const requestedWait = parseFloat(retryMatch[1]) * 1000 + 2000; // Add 2s padding
                    waitMs = Math.max(waitMs, requestedWait);
                }
                
                console.log(`Rate limited. Waiting ${Math.round(waitMs / 1000)}s (retry ${attempt + 1}/${maxRetries})...`);
                await new Promise(r => setTimeout(r, waitMs));
            } else {
                throw error;
            }
        }
    }
}

/**
 * Router Agent
 * Analyzes the target's tech stack and decides which experts to invoke.
 */
export async function routeToExperts(url, scrapedData, toolResults) {
    const ai = getAI();

    const techHints = {
        metas: scrapedData.structure?.metas || {},
        externalScripts: scrapedData.externalScripts || [],
        responseHeaders: scrapedData.responseHeaders || {},
        apiCallCount: scrapedData.apiCalls?.length || 0,
        hasForms: (scrapedData.structure?.forms?.length || 0) > 0,
        cookieCount: scrapedData.cookies?.length || 0,
        html: scrapedData.html?.substring(0, 2000) || '',
    };

    const routerPrompt = `You are a security triage router. Analyze this snippet of evidence from a web target and return a JSON object indicating which expert analysts should review it.

URL: ${url}
Response Headers (partial): ${JSON.stringify(Object.entries(techHints.responseHeaders).slice(0, 10))}
External scripts: ${techHints.externalScripts.slice(0, 5).join(', ')}
API calls intercepted: ${techHints.apiCallCount}
Has input forms: ${techHints.hasForms}
Cookie count: ${techHints.cookieCount}
HTML excerpt:
${techHints.html.substring(0, 1000)}

Return ONLY a JSON object with boolean fields:
{
  "webExpert": true/false,     // XSS, CSRF, IDOR, injection vulnerabilities
  "infraExpert": true/false,   // Headers, TLS, server config, cloud misconfig
  "apiExpert": true/false,     // API security, auth, JWT, OAuth, tokens
  "reasoning": "one line"
}`;

    try {
        const result = await retryWithBackoff(async () => {
            const response = await ai.models.generateContent({
                model: 'gemini-2.0-flash',
                contents: routerPrompt,
                config: { responseMimeType: 'application/json' }
            });
            return response.text;
        });

        const parsed = JSON.parse(result);
        return {
            webExpert: parsed.webExpert ?? true,
            infraExpert: parsed.infraExpert ?? true,
            apiExpert: parsed.apiExpert ?? true,
            reasoning: parsed.reasoning || 'All experts engaged by default',
        };
    } catch (err) {
        console.warn('Router failed, engaging all experts:', err.message);
        return { webExpert: true, infraExpert: true, apiExpert: true, reasoning: 'Default routing' };
    }
}
