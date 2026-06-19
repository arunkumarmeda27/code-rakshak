// ═══════════════════════════════════════════════════════════════════════════
// WATERMARK: Copyright (c) 2026 Code Rakshak by arunkumarmeda27.
// Protected under MIT License. All copies must contain this watermark.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Code Rakshak — Secrets Scanner Service
 * Scans code for hardcoded secrets, api keys, tokens, database URIs, private keys.
 * Correctly attributes leaks to their source file and line number in combined outputs.
 */

export function scanForSecrets(code, defaultFilename = 'untitled') {
    const findings = [];
    if (!code) return findings;

    const lines = code.split(/\r?\n/);
    let currentFile = defaultFilename;
    let currentLine = 0;

    const SECRET_RULES = [
        {
            name: 'GitHub Personal Access Token',
            regex: /\b(ghp_[a-zA-Z0-9]{36})\b/g,
            severity: 'critical',
            remediation: 'Revoke the token immediately from your GitHub Developer Settings, delete it from your code history, and use environment variables or a secrets manager.',
            obfuscate: (val) => val.substring(0, 4) + '...' + val.substring(val.length - 4)
        },
        {
            name: 'GitHub Fine-Grained Token',
            regex: /\b(github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59})\b/g,
            severity: 'critical',
            remediation: 'Revoke the fine-grained token immediately from your GitHub Settings, and use environment variables.',
            obfuscate: (val) => val.substring(0, 15) + '...' + val.substring(val.length - 4)
        },
        {
            name: 'AWS Access Key ID',
            regex: /\b(AKIA[0-9A-Z]{16})\b/g,
            severity: 'critical',
            remediation: 'Deactivate the AWS Access Key immediately in the AWS IAM Console, delete it from your codebase, and use AWS IAM Roles or environment variables.',
            obfuscate: (val) => val.substring(0, 4) + '...' + val.substring(val.length - 4)
        },
        {
            name: 'Google API Key',
            regex: /\b(AIzaSy[A-Za-z0-9-_]{33})\b/g,
            severity: 'critical',
            remediation: 'Go to Google Cloud Console APIs & Services > Credentials, delete or restrict the key, and load it from environment variables.',
            obfuscate: (val) => val.substring(0, 6) + '...' + val.substring(val.length - 4)
        },
        {
            name: 'Stripe API Key',
            regex: /\b((?:sk|pk)_(?:live|test)_[0-9a-zA-Z]{24})\b/g,
            severity: 'critical',
            remediation: 'Revoke this API key immediately in your Stripe Dashboard under Developers > API keys and roll the key.',
            obfuscate: (val) => val.substring(0, 8) + '...' + val.substring(val.length - 4)
        },
        {
            name: 'Slack Webhook URL',
            regex: /(https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9_]{8}\/B[A-Z0-9_]{8}\/[A-Za-z0-9_]{24})/g,
            severity: 'critical',
            remediation: 'Revoke the webhook URL immediately from your Slack App management portal and load it dynamically.',
            obfuscate: (val) => val.substring(0, 32) + '...' + val.substring(val.length - 4)
        },
        {
            name: 'Slack Bot Token',
            regex: /\b(xoxb-[0-9]{11,13}-[a-zA-Z0-9]{24})\b/g,
            severity: 'critical',
            remediation: 'Revoke the bot token in your Slack App admin UI, rotate client secret, and secure token access.',
            obfuscate: (val) => val.substring(0, 9) + '...' + val.substring(val.length - 4)
        },
        {
            name: 'Database Connection URI',
            regex: /\b((?:mongodb(?:\+srv)?|postgres|postgresql|mysql|sqlserver):\/\/[a-zA-Z0-9_.-]+:([^@\r\n]+)@[a-zA-Z0-9_.-]+)/gi,
            severity: 'critical',
            remediation: 'Change your database user password immediately, delete the connection string from code, and load it via config files or system env.',
            obfuscate: (val) => {
                return val.replace(/:[^:@\s/]+@/, ':********@');
            }
        },
        {
            name: 'Private Key',
            regex: /(-----BEGIN (?:RSA |EC |PGP |DSA )?PRIVATE KEY-----)/g,
            severity: 'critical',
            remediation: 'Revoke the certificate or key immediately on all endpoints, generate a new private key pair, and load it securely as a file outside of the Git index.',
            obfuscate: (val) => val
        },
        {
            name: 'Hardcoded Variable Secret',
            regex: /\b(?:api[_-]?key|secret|token|password|passwd|auth_token|client[_-]?secret)\s*[:=]\s*["']([^"'\r\n]{8,})["']/gi,
            severity: 'critical',
            remediation: 'Remove this hardcoded password or token from code. Use process.env variables (Node) or os.environ (Python) to read it dynamically.',
            obfuscate: (val) => {
                const clean = val.trim();
                // Avoid matching placeholders
                if (
                    clean.toLowerCase().includes('dummy') ||
                    clean.toLowerCase().includes('your_') ||
                    clean.toLowerCase().includes('placeholder') ||
                    clean.toLowerCase().includes('my_') ||
                    clean.toLowerCase().includes('example') ||
                    clean.length < 8
                ) {
                    return null;
                }
                return clean.substring(0, 3) + '...' + clean.substring(clean.length - 3);
            }
        }
    ];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Check if this line is part of a file header separator
        // E.g., ============================================================
        // FILE: path/to/file.js
        // ============================================================
        if (trimmed.startsWith('====') && i + 1 < lines.length && lines[i + 1].trim().startsWith('FILE: ')) {
            const fileLine = lines[i + 1].trim();
            currentFile = fileLine.replace('FILE: ', '').trim();
            // Skip the next separator too
            if (i + 2 < lines.length && lines[i + 2].trim().startsWith('====')) {
                i += 2;
            } else {
                i += 1;
            }
            currentLine = 0;
            continue;
        }

        currentLine++;

        // Run secret rules on this line
        for (const rule of SECRET_RULES) {
            rule.regex.lastIndex = 0; // reset regex
            let match;
            while ((match = rule.regex.exec(line)) !== null) {
                const secretValue = match[1] || match[0];
                const obfuscated = rule.obfuscate(secretValue);
                if (obfuscated === null) continue; // skipped

                findings.push({
                    name: rule.name,
                    severity: rule.severity,
                    file: currentFile,
                    line: currentLine,
                    sample: line.replace(secretValue, obfuscated).trim(),
                    remediation: rule.remediation,
                    obfuscatedSecret: obfuscated,
                    isSecret: true
                });
            }
        }
    }

    return findings;
}
