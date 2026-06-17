/**
 * Security Header Checker
 * Analyzes HTTP response headers for security best practices.
 */

const SECURITY_HEADERS = [
    {
        name: 'strict-transport-security',
        label: 'Strict-Transport-Security (HSTS)',
        severity: 'High',
        description: 'Forces browsers to use HTTPS and protects against protocol downgrade attacks.',
        recommendation: 'Add: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`',
        validate: (val) => {
            if (!val) return { status: 'missing' };
            if (!val.includes('max-age')) return { status: 'weak', note: 'Missing max-age directive' };
            const maxAge = parseInt((val.match(/max-age=(\d+)/) || [])[1] || '0');
            if (maxAge < 31536000) return { status: 'weak', note: `max-age=${maxAge} is too short (< 1 year)` };
            return { status: 'present', note: 'Properly configured' };
        },
    },
    {
        name: 'content-security-policy',
        label: 'Content-Security-Policy (CSP)',
        severity: 'High',
        description: 'Prevents XSS by whitelisting allowed content sources.',
        recommendation: 'Implement a strict CSP. Avoid `unsafe-inline` and `unsafe-eval`.',
        validate: (val) => {
            if (!val) return { status: 'missing' };
            const issues = [];
            if (val.includes("'unsafe-inline'")) issues.push("unsafe-inline present");
            if (val.includes("'unsafe-eval'")) issues.push("unsafe-eval present");
            if (val.includes('*')) issues.push("wildcard (*) source present");
            if (issues.length > 0) return { status: 'weak', note: issues.join('; ') };
            return { status: 'present', note: 'CSP defined' };
        },
    },
    {
        name: 'x-frame-options',
        label: 'X-Frame-Options',
        severity: 'Medium',
        description: 'Prevents clickjacking attacks by controlling iframe embedding.',
        recommendation: 'Add: `X-Frame-Options: DENY` or `SAMEORIGIN`',
        validate: (val) => {
            if (!val) return { status: 'missing' };
            const normalized = val.toUpperCase();
            if (!['DENY', 'SAMEORIGIN'].includes(normalized.trim())) return { status: 'weak', note: `Unusual value: ${val}` };
            return { status: 'present' };
        },
    },
    {
        name: 'x-content-type-options',
        label: 'X-Content-Type-Options',
        severity: 'Medium',
        description: 'Prevents MIME-type sniffing attacks.',
        recommendation: 'Add: `X-Content-Type-Options: nosniff`',
        validate: (val) => {
            if (!val) return { status: 'missing' };
            if (val.trim().toLowerCase() !== 'nosniff') return { status: 'weak', note: `Should be "nosniff", got "${val}"` };
            return { status: 'present' };
        },
    },
    {
        name: 'referrer-policy',
        label: 'Referrer-Policy',
        severity: 'Low',
        description: 'Controls how much referrer information is included with requests.',
        recommendation: 'Add: `Referrer-Policy: strict-origin-when-cross-origin`',
        validate: (val) => {
            if (!val) return { status: 'missing' };
            const safePolicies = ['no-referrer', 'no-referrer-when-downgrade', 'strict-origin', 'strict-origin-when-cross-origin', 'same-origin'];
            if (!safePolicies.includes(val.trim().toLowerCase())) return { status: 'weak', note: `Policy "${val}" may leak referrer data` };
            return { status: 'present' };
        },
    },
    {
        name: 'permissions-policy',
        label: 'Permissions-Policy',
        severity: 'Low',
        description: 'Controls access to browser features like camera, microphone, geolocation.',
        recommendation: 'Add: `Permissions-Policy: camera=(), microphone=(), geolocation=()`',
        validate: (val) => {
            if (!val) return { status: 'missing' };
            return { status: 'present' };
        },
    },
    {
        name: 'x-xss-protection',
        label: 'X-XSS-Protection',
        severity: 'Info',
        description: 'Legacy XSS filter for older browsers. Modern sites use CSP instead.',
        recommendation: 'Set to `0` (disabled) to prevent potential bypass, or rely on CSP.',
        validate: (val) => {
            if (!val) return { status: 'missing' };
            return { status: 'present', note: 'Legacy header — prefer CSP' };
        },
    },
    {
        name: 'cache-control',
        label: 'Cache-Control',
        severity: 'Info',
        description: 'Controls how responses are cached. Missing on sensitive pages can expose data.',
        recommendation: 'For sensitive pages: `Cache-Control: no-store, no-cache, must-revalidate`',
        validate: (val) => {
            if (!val) return { status: 'missing' };
            return { status: 'present' };
        },
    },
];

/**
 * @param {object} rawHeaders - raw HTTP response headers object (lower-cased keys)
 * @returns {object} headerResults
 */
export function checkSecurityHeaders(rawHeaders) {
    const findings = [];
    let missingCount = 0;
    let weakCount = 0;
    let presentCount = 0;

    for (const header of SECURITY_HEADERS) {
        const val = rawHeaders[header.name] || null;
        const validation = header.validate(val);

        findings.push({
            header: header.label,
            status: validation.status,        // 'present' | 'weak' | 'missing'
            severity: header.severity,
            value: val || '(not set)',
            note: validation.note || '',
            description: header.description,
            recommendation: header.recommendation,
        });

        if (validation.status === 'missing') missingCount++;
        else if (validation.status === 'weak') weakCount++;
        else presentCount++;
    }

    // Check for information disclosure in headers
    const disclosureHeaders = ['server', 'x-powered-by', 'x-aspnet-version', 'x-aspnetmvc-version', 'x-generator'];
    const disclosures = [];
    for (const h of disclosureHeaders) {
        if (rawHeaders[h]) {
            disclosures.push({ header: h, value: rawHeaders[h] });
        }
    }

    return {
        findings,
        summary: { present: presentCount, weak: weakCount, missing: missingCount },
        disclosures,
    };
}
