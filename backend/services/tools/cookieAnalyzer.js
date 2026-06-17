/**
 * Cookie & Session Analyzer
 * Checks cookies for security flags and common misconfigurations.
 */

export function analyzeCookies(cookies) {
    if (!cookies || cookies.length === 0) {
        return { count: 0, findings: [], summary: 'No cookies found on this page.' };
    }

    const findings = [];

    // Detect likely session cookies by name pattern
    const sessionNamePattern = /^(sess(ion)?|sid|auth|token|jwt|connect\.sid|PHPSESSID|ASP\.NET_SessionId|JSESSIONID|csrftoken)$/i;

    for (const cookie of cookies) {
        const isSensitive = sessionNamePattern.test(cookie.name) || cookie.name.length > 10;

        // Missing Secure flag
        if (!cookie.secure) {
            findings.push({
                cookie: cookie.name,
                issue: 'Missing Secure flag',
                severity: isSensitive ? 'High' : 'Medium',
                detail: `Cookie "${cookie.name}" can be transmitted over HTTP, exposing it to network sniffing.`,
                fix: `Set Secure flag: Set-Cookie: ${cookie.name}=...; Secure`,
            });
        }

        // Missing HttpOnly flag
        if (!cookie.httpOnly) {
            findings.push({
                cookie: cookie.name,
                issue: 'Missing HttpOnly flag',
                severity: isSensitive ? 'High' : 'Medium',
                detail: `Cookie "${cookie.name}" is accessible via JavaScript, making it vulnerable to XSS theft.`,
                fix: `Set HttpOnly flag: Set-Cookie: ${cookie.name}=...; HttpOnly`,
            });
        }

        // SameSite check
        const sameSite = cookie.sameSite || '';
        if (!sameSite || sameSite === 'None') {
            findings.push({
                cookie: cookie.name,
                issue: `Missing/Weak SameSite (${sameSite || 'not set'})`,
                severity: isSensitive ? 'High' : 'Low',
                detail: `Cookie "${cookie.name}" without SameSite=Strict/Lax is vulnerable to CSRF attacks.`,
                fix: `Set SameSite: Set-Cookie: ${cookie.name}=...; SameSite=Strict`,
            });
        }

        // Session fixation: check if session cookie persists forever
        if (isSensitive && cookie.expires && cookie.expires > 0) {
            const expiresDate = new Date(cookie.expires * 1000);
            const daysUntilExpiry = Math.floor((expiresDate - Date.now()) / (1000 * 60 * 60 * 24));
            if (daysUntilExpiry > 365) {
                findings.push({
                    cookie: cookie.name,
                    issue: 'Long-lived session cookie',
                    severity: 'Medium',
                    detail: `Session cookie "${cookie.name}" expires in ${daysUntilExpiry} days — increases session hijacking window.`,
                    fix: 'Use shorter session expiry. Implement sliding sessions with server-side invalidation.',
                });
            }
        }
    }

    // Check for duplicate session cookies (possible session fixation)
    const names = cookies.map(c => c.name);
    const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
    if (duplicates.length > 0) {
        findings.push({
            cookie: duplicates.join(', '),
            issue: 'Duplicate cookie names',
            severity: 'Medium',
            detail: `Multiple cookies with same name: ${duplicates.join(', ')}. This can cause session fixation.`,
            fix: 'Ensure cookies are unique per domain/path. Audit session management logic.',
        });
    }

    const severityCounts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    findings.forEach(f => { if (severityCounts[f.severity] !== undefined) severityCounts[f.severity]++; });

    return {
        count: cookies.length,
        cookies: cookies.map(c => ({
            name: c.name,
            secure: c.secure,
            httpOnly: c.httpOnly,
            sameSite: c.sameSite || '(none)',
            domain: c.domain,
        })),
        findings,
        severityCounts,
    };
}
