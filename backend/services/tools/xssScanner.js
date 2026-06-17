/**
 * XSS Pattern Scanner
 * Performs static analysis on DOM data for XSS vulnerabilities.
 */

// Dangerous sink patterns with explanations
const DOM_SINKS = [
    { pattern: 'innerHTML assignment', severity: 'High', cwe: 'CWE-79', description: 'Direct innerHTML assignment can inject arbitrary HTML/JS if input is not sanitized.' },
    { pattern: 'document.write()', severity: 'High', cwe: 'CWE-79', description: 'document.write() can inject raw HTML into the page.' },
    { pattern: 'eval()', severity: 'Critical', cwe: 'CWE-95', description: 'eval() executes arbitrary strings as JavaScript code.' },
    { pattern: 'setTimeout(string)', severity: 'High', cwe: 'CWE-95', description: 'setTimeout with a string argument executes it as JS (same as eval).' },
    { pattern: 'setInterval(string)', severity: 'High', cwe: 'CWE-95', description: 'setInterval with a string argument executes it as JS (same as eval).' },
    { pattern: 'location.href redirect', severity: 'Medium', cwe: 'CWE-601', description: 'Unvalidated location.href redirect can enable open redirect attacks.' },
    { pattern: 'React dangerouslySetInnerHTML', severity: 'High', cwe: 'CWE-79', description: 'React dangerouslySetInnerHTML bypasses React\'s XSS protection.' },
    { pattern: 'postMessage', severity: 'Medium', cwe: 'CWE-346', description: 'postMessage without origin validation enables cross-origin attacks.' },
];

/**
 * Analyze scraper data for XSS indicators.
 * @param {object} scrapedData - from scraper.js
 * @returns {object} xssResults
 */
export function scanXSS(scrapedData) {
    const findings = [];

    // ── 1. DOM sink findings from scanner ─────────────────────────────────────
    const detectedSinks = scrapedData.structure?.xssSinks || [];
    for (const sink of detectedSinks) {
        const sinkDef = DOM_SINKS.find(s => s.pattern === sink);
        if (sinkDef) {
            findings.push({
                type: 'DOM XSS Sink',
                sink: sinkDef.pattern,
                severity: sinkDef.severity,
                cwe: sinkDef.cwe,
                detail: sinkDef.description,
                fix: 'Sanitize all user-controlled values before passing to this sink. Use DOMPurify or a templating engine with auto-escaping.',
            });
        }
    }

    // ── 2. Form input analysis (potential reflected XSS ────────────────────────
    const forms = scrapedData.structure?.forms || [];
    for (const form of forms) {
        // Text inputs with no autocomplete-off might accept raw user data
        const textInputs = form.inputs.filter(i => ['text', 'search', 'url', 'email', 'textarea'].includes(i.type));
        if (textInputs.length > 0 && form.action) {
            findings.push({
                type: 'Potential Reflected XSS Vector',
                severity: 'Medium',
                cwe: 'CWE-79',
                detail: `Form with action "${form.action.substring(0, 100)}" (method: ${form.method.toUpperCase()}) has ${textInputs.length} text input(s) — a potential reflected XSS test surface.`,
                inputs: textInputs.map(i => i.name || i.type).join(', '),
                fix: 'Ensure all input fields are validated server-side and output is HTML-encoded in responses.',
            });
        }
    }

    // ── 3. iFrame injection point ───────────────────────────────────────────────
    const iframes = scrapedData.structure?.iframes || [];
    const suspiciousIframes = iframes.filter(src => src && !src.startsWith('javascript:void'));
    if (suspiciousIframes.length > 0) {
        findings.push({
            type: 'Embedded iFrames',
            severity: 'Low',
            cwe: 'CWE-1021',
            detail: `${suspiciousIframes.length} iframe(s) found. Embedded third-party content can introduce XSS risks if not sandboxed.`,
            sources: suspiciousIframes.slice(0, 5).join(', '),
            fix: 'Add sandbox attribute to iframes: `<iframe sandbox="allow-scripts allow-same-origin">`',
        });
    }

    // ── 4. External scripts ─────────────────────────────────────────────────────
    const externalScripts = scrapedData.externalScripts || [];
    if (externalScripts.length > 3) {
        const thirdParty = externalScripts.filter(s => {
            try { return new URL(s).hostname !== new URL(scrapedData.finalUrl || '').hostname; } catch { return false; }
        });
        if (thirdParty.length > 0) {
            findings.push({
                type: 'Third-party Script Loading',
                severity: 'Low',
                cwe: 'CWE-829',
                detail: `${thirdParty.length} external scripts loaded from third parties. Compromise of any CDN = XSS on this page.`,
                sources: thirdParty.slice(0, 3).join('\n'),
                fix: 'Use Subresource Integrity (SRI) hashes: `<script src="..." integrity="sha384-...">`',
            });
        }
    }

    // ── 5. Exposed secrets in client-side code ──────────────────────────────────
    const exposedSecrets = scrapedData.structure?.exposedSecrets || [];
    for (const secret of exposedSecrets) {
        findings.push({
            type: 'Exposed Secret in Client-Side Code',
            severity: 'Critical',
            cwe: 'CWE-312',
            detail: `Possible ${secret.label} found in JavaScript source: ${secret.preview}`,
            fix: 'Never hardcode secrets in client-side code. Move to server-side environment variables.',
        });
    }

    const severityCounts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    findings.forEach(f => { if (severityCounts[f.severity] !== undefined) severityCounts[f.severity]++; });

    return { findings, severityCounts };
}
