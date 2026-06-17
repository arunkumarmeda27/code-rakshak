import { checkSecurityHeaders } from './tools/headerChecker.js';
import { checkSSL } from './tools/sslChecker.js';
import { analyzeCookies } from './tools/cookieAnalyzer.js';
import { scanXSS } from './tools/xssScanner.js';
import { enumerateAPIs } from './tools/apiEnumerator.js';

/**
 * Tool Orchestrator
 * Runs all security analysis tools in parallel waves and returns structured results.
 */
export async function runAllTools(url, scrapedData, onProgress) {
    const emit = (phase, msg) => { if (onProgress) onProgress(phase, msg); };

    emit('tools', '🔒 Running security header analysis...');
    emit('tools', '🍪 Analyzing cookies and session management...');
    emit('tools', '🔍 Scanning for XSS sinks and injection vectors...');

    // Wave 1: All synchronous / fast tools in parallel
    const [headerResults, cookieResults, xssResults, sslResults] = await Promise.all([
        Promise.resolve(checkSecurityHeaders(scrapedData.responseHeaders || {})),
        Promise.resolve(analyzeCookies(scrapedData.cookies || [])),
        Promise.resolve(scanXSS(scrapedData)),
        checkSSL(url),
    ]);

    emit('tools', '🌐 Enumerating API endpoints and sensitive paths...');

    // Wave 2: I/O-bound tool (network probing)
    const apiResults = await enumerateAPIs(url, scrapedData.apiCalls || []);

    emit('tools', '✅ All tool checks complete');

    return {
        headers: headerResults,
        ssl: sslResults,
        cookies: cookieResults,
        xss: xssResults,
        api: apiResults,
    };
}

/**
 * Summarize tool results into a flat severity count.
 */
export function aggregateSeverities(toolResults) {
    const counts = { Critical: 0, High: 0, Medium: 0, Low: 0, Info: 0 };

    const add = (findings) => {
        if (!Array.isArray(findings)) return;
        findings.forEach(f => {
            const sev = f.severity;
            if (counts[sev] !== undefined) counts[sev]++;
        });
    };

    // Headers
    add(toolResults.headers?.findings?.filter(f => f.status === 'missing' || f.status === 'weak'));

    // SSL
    if (toolResults.ssl?.findings) {
        toolResults.ssl.findings.forEach(() => {
            if (counts[toolResults.ssl.severity] !== undefined) counts[toolResults.ssl.severity]++;
        });
    }

    // Cookies
    add(toolResults.cookies?.findings);

    // XSS
    add(toolResults.xss?.findings);

    // API
    add(toolResults.api?.findings);

    return counts;
}
