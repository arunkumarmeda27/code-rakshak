import tls from 'tls';
import https from 'https';
import { URL } from 'url';

/**
 * SSL/TLS Checker
 * Analyzes certificate validity, TLS version, and cipher strength.
 */
export async function checkSSL(targetUrl) {
    let parsed;
    try {
        parsed = new URL(targetUrl);
    } catch {
        return { skipped: true, reason: 'Invalid URL' };
    }

    if (parsed.protocol !== 'https:') {
        return {
            skipped: false,
            httpsEnabled: false,
            severity: 'Critical',
            finding: 'Site does not use HTTPS',
            details: 'All traffic is transmitted in plaintext, exposing users to man-in-the-middle attacks.',
            recommendation: 'Migrate to HTTPS immediately. Obtain a free TLS certificate from Let\'s Encrypt.',
        };
    }

    const host = parsed.hostname;
    const port = parseInt(parsed.port) || 443;

    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            resolve({ skipped: true, reason: 'SSL check timed out' });
        }, 8000);

        try {
            const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: false }, () => {
                clearTimeout(timeout);
                try {
                    const cert = socket.getPeerCertificate(true);
                    const protocol = socket.getProtocol();
                    const cipher = socket.getCipher();

                    const findings = [];
                    let severity = 'Info';

                    // Check TLS version
                    if (['SSLv3', 'TLSv1', 'TLSv1.1'].includes(protocol)) {
                        findings.push(`Outdated TLS version: ${protocol}. Vulnerable to POODLE/BEAST attacks.`);
                        severity = 'High';
                    }

                    // Check cipher
                    const weakCiphers = ['RC4', 'DES', '3DES', 'MD5', 'NULL', 'EXPORT', 'anon'];
                    if (weakCiphers.some(wc => cipher.name && cipher.name.toUpperCase().includes(wc))) {
                        findings.push(`Weak cipher suite in use: ${cipher.name}`);
                        severity = 'High';
                    }

                    // Check expiry
                    const expiryDate = cert.valid_to ? new Date(cert.valid_to) : null;
                    const daysUntilExpiry = expiryDate ? Math.floor((expiryDate - Date.now()) / (1000 * 60 * 60 * 24)) : null;
                    if (daysUntilExpiry !== null && daysUntilExpiry < 0) {
                        findings.push(`Certificate EXPIRED ${Math.abs(daysUntilExpiry)} days ago.`);
                        severity = 'Critical';
                    } else if (daysUntilExpiry !== null && daysUntilExpiry < 30) {
                        findings.push(`Certificate expires in ${daysUntilExpiry} days — renewal needed soon.`);
                        if (severity === 'Info') severity = 'Medium';
                    }

                    // Self-signed check
                    if (cert.issuer && cert.subject &&
                        cert.issuer.CN === cert.subject.CN &&
                        cert.issuer.O === cert.subject.O) {
                        findings.push('Certificate appears self-signed — browsers will show a warning.');
                        if (severity === 'Info') severity = 'Medium';
                    }

                    socket.destroy();

                    resolve({
                        skipped: false,
                        httpsEnabled: true,
                        protocol,
                        cipher: cipher.name,
                        cipherBits: cipher.version,
                        subject: cert.subject,
                        issuer: cert.issuer,
                        validFrom: cert.valid_from,
                        validTo: cert.valid_to,
                        daysUntilExpiry,
                        findings,
                        severity: findings.length === 0 ? 'Info' : severity,
                        overall: findings.length === 0 ? 'Good' : 'Issues found',
                    });
                } catch (err) {
                    clearTimeout(timeout);
                    socket.destroy();
                    resolve({ skipped: true, reason: `Certificate parse error: ${err.message}` });
                }
            });

            socket.on('error', (err) => {
                clearTimeout(timeout);
                resolve({ skipped: true, reason: `TLS connection error: ${err.message}` });
            });
        } catch (err) {
            clearTimeout(timeout);
            resolve({ skipped: true, reason: `SSL check error: ${err.message}` });
        }
    });
}
