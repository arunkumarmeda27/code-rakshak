import axios from 'axios';
import { URL } from 'url';

/**
 * API Endpoint Enumerator
 * Analyzes intercepted XHR/fetch calls and probes common API paths.
 */

const COMMON_SENSITIVE_PATHS = [
    '/api/v1/users', '/api/users', '/api/admin', '/api/config',
    '/api/debug', '/api/health', '/admin', '/admin/dashboard',
    '/.env', '/.git/HEAD', '/config.json', '/backup.zip',
    '/api/v1/me', '/api/me', '/graphql', '/graphql/playground',
    '/swagger', '/swagger-ui.html', '/swagger/v1/swagger.json', '/openapi.json',
    '/api-docs', '/api/v1/status', '/status', '/actuator', '/actuator/health',
    '/actuator/env', '/actuator/beans', '/debug', '/console',
    '/phpinfo.php', '/info.php', '/.well-known/security.txt',
    '/robots.txt', '/sitemap.xml',
];

/**
 * @param {string} targetUrl - Base URL to probe
 * @param {Array} interceptedCalls - XHR/fetch calls from scraper
 * @returns {object} apiResults
 */
export async function enumerateAPIs(targetUrl, interceptedCalls = []) {
    let origin;
    try {
        origin = new URL(targetUrl).origin;
    } catch {
        return { skipped: true, reason: 'Invalid URL' };
    }

    const findings = [];

    // ── 1. Analyze already-intercepted API calls ────────────────────────────────
    if (interceptedCalls.length > 0) {
        const unauthenticated = interceptedCalls.filter(c =>
            c.status === 200 && (c.contentType.includes('json') || c.contentType.includes('xml'))
        );

        if (unauthenticated.length > 0) {
            findings.push({
                type: 'Observed API Endpoints',
                severity: 'Info',
                detail: `${unauthenticated.length} API endpoint(s) successfully called during page load without authentication headers.`,
                endpoints: unauthenticated.map(c => `${c.method} ${c.url}`).slice(0, 10),
                note: 'Verify each endpoint requires proper authentication for sensitive operations.',
            });
        }

        // Look for API keys / tokens in intercepted call URLs
        const tokenPattern = /[?&](key|api_key|token|access_token|apikey|auth)=([^&]+)/i;
        const leakyUrls = interceptedCalls.filter(c => tokenPattern.test(c.url));
        if (leakyUrls.length > 0) {
            findings.push({
                type: 'API Keys in URL Parameters',
                severity: 'High',
                cwe: 'CWE-598',
                detail: `${leakyUrls.length} API call(s) contain sensitive tokens in the URL query string — these get logged in server logs, browser history, and referrer headers.`,
                examples: leakyUrls.map(c => c.url.substring(0, 100)).slice(0, 3),
                fix: 'Move API keys/tokens to HTTP headers (Authorization: Bearer ...) instead of URL parameters.',
            });
        }
    }

    // ── 2. Probe standard sensitive paths ─────────────────────────────────────
    const results = await Promise.allSettled(
        COMMON_SENSITIVE_PATHS.map(async (path) => {
            const probeUrl = `${origin}${path}`;
            try {
                const res = await axios.get(probeUrl, {
                    timeout: 5000,
                    maxRedirects: 2,
                    validateStatus: () => true,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (security-audit/bbaa)',
                        'Accept': 'application/json,text/html,*/*',
                    },
                });
                return { path, status: res.status, contentType: res.headers['content-type'] || '', size: JSON.stringify(res.data).length };
            } catch {
                return { path, status: 0 };
            }
        })
    );

    const accessible = results
        .filter(r => r.status === 'fulfilled' && r.value.status > 0 && r.value.status !== 404 && r.value.status !== 403)
        .map(r => r.value);

    // Classify by severity
    const criticalPaths = ['/.env', '/.git/HEAD', '/config.json', '/backup.zip'];
    const highPaths = ['/admin', '/admin/dashboard', '/actuator/env', '/actuator/beans', '/console', '/phpinfo.php'];
    const apiDocPaths = ['/swagger', '/swagger-ui.html', '/openapi.json', '/api-docs', '/graphql/playground'];

    for (const endpoint of accessible) {
        let severity = 'Info';
        let detail = `Path ${endpoint.path} returned HTTP ${endpoint.status}`;

        if (criticalPaths.some(p => endpoint.path.startsWith(p))) {
            severity = 'Critical';
            detail = `CRITICAL: Sensitive file ${endpoint.path} is publicly accessible! This may expose credentials, configuration, or source control history.`;
        } else if (highPaths.some(p => endpoint.path.startsWith(p))) {
            severity = 'High';
            detail = `Admin/sensitive path ${endpoint.path} returned ${endpoint.status}. Verify it requires authentication.`;
        } else if (apiDocPaths.some(p => endpoint.path.startsWith(p))) {
            severity = 'Medium';
            detail = `API documentation at ${endpoint.path} is publicly accessible — this exposes your API surface to attackers.`;
        } else if (endpoint.status === 200) {
            severity = 'Low';
        }

        findings.push({
            type: 'Accessible Endpoint',
            path: endpoint.path,
            httpStatus: endpoint.status,
            contentType: endpoint.contentType,
            severity,
            detail,
            fix: severity === 'Critical' ? 'Remove or block access to this file immediately via server config.' :
                 severity === 'High' ? 'Require authentication for this path.' :
                 'Review if this endpoint should be publicly accessible.',
        });
    }

    // Sort by severity
    const order = { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4 };
    findings.sort((a, b) => (order[a.severity] ?? 5) - (order[b.severity] ?? 5));

    return {
        interceptedCallCount: interceptedCalls.length,
        probedPaths: COMMON_SENSITIVE_PATHS.length,
        accessiblePaths: accessible.length,
        findings,
    };
}
