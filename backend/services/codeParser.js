/**
 * Code Rakshak — Code Parser Service
 * Detects language, extracts structure metadata, and prepares code for AI analysis.
 */

const LANGUAGE_SIGNATURES = {
    python: {
        patterns: [/^import\s+\w+/m, /^from\s+\w+\s+import/m, /def\s+\w+\s*\(/m, /:\s*$/, /print\s*\(/m],
        keywords: ['def ', 'class ', 'import ', 'from ', 'elif ', 'lambda ', 'self.', '__init__'],
        extensions: ['.py', '.pyw']
    },
    javascript: {
        patterns: [/const\s+\w+\s*=/, /let\s+\w+\s*=/, /var\s+\w+\s*=/, /=>\s*{/, /require\s*\(/, /module\.exports/],
        keywords: ['const ', 'let ', 'var ', '=>', 'require(', 'module.exports', 'async ', 'await '],
        extensions: ['.js', '.mjs', '.cjs']
    },
    typescript: {
        patterns: [/:\s*(string|number|boolean|any|void|never)\b/, /interface\s+\w+/, /type\s+\w+\s*=/, /<T>/, /as\s+\w+/],
        keywords: ['interface ', 'type ', ': string', ': number', ': boolean', 'enum ', 'namespace '],
        extensions: ['.ts', '.tsx']
    },
    java: {
        patterns: [/public\s+class\s+\w+/, /public\s+static\s+void\s+main/, /System\.out\.print/, /import\s+java\./],
        keywords: ['public class', 'private ', 'protected ', 'static ', 'void ', 'String ', 'int ', 'new '],
        extensions: ['.java']
    },
    cpp: {
        patterns: [/#include\s*</, /std::/, /cout\s*<</, /cin\s*>>/, /int\s+main\s*\(/],
        keywords: ['#include', 'std::', 'cout', 'cin', 'namespace ', 'template<', '::'],
        extensions: ['.cpp', '.cc', '.cxx', '.h', '.hpp']
    },
    c: {
        patterns: [/#include\s*<stdio\.h>/, /printf\s*\(/, /scanf\s*\(/, /int\s+main\s*\(void\)/],
        keywords: ['#include', 'printf(', 'scanf(', 'malloc(', 'free(', 'struct ', 'typedef '],
        extensions: ['.c', '.h']
    },
    go: {
        patterns: [/^package\s+\w+/m, /^func\s+\w+/m, /fmt\.Print/, /:=/, /^import\s+\(/m],
        keywords: ['func ', 'goroutine', 'chan ', ':= ', 'defer ', 'go ', 'package '],
        extensions: ['.go']
    },
    rust: {
        patterns: [/fn\s+\w+\s*\(/, /let\s+mut\s+/, /use\s+std::/, /impl\s+\w+/, /println!\s*\(/],
        keywords: ['fn ', 'let mut', 'use std::', 'impl ', 'struct ', 'enum ', 'match ', 'println!'],
        extensions: ['.rs']
    },
    php: {
        patterns: [/<\?php/, /\$\w+\s*=/, /echo\s+/, /function\s+\w+\s*\(/, /->/, /=>/],
        keywords: ['<?php', '$', 'echo ', 'function ', '->', '=>', 'class ', 'namespace '],
        extensions: ['.php']
    },
    ruby: {
        patterns: [/def\s+\w+/, /require\s+'/, /puts\s+/, /\.each\s+do/, /end$/, /attr_accessor/],
        keywords: ['def ', 'end', 'puts ', 'require ', 'class ', 'module ', 'do |', 'attr_'],
        extensions: ['.rb', '.rake']
    },
    csharp: {
        patterns: [/using\s+System/, /namespace\s+\w+/, /public\s+class\s+\w+/, /Console\.Write/],
        keywords: ['using System', 'namespace ', 'var ', 'string ', 'int ', 'public ', 'private '],
        extensions: ['.cs']
    }
};

/**
 * Detects programming language from code content and optional filename.
 */
function detectLanguage(code, hint = 'auto', filename = '') {
    if (hint && hint !== 'auto') return hint.toLowerCase();

    // Try from filename extension
    if (filename) {
        const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
        for (const [lang, config] of Object.entries(LANGUAGE_SIGNATURES)) {
            if (config.extensions.includes(ext)) return lang;
        }
    }

    // Score each language by pattern matching
    const scores = {};
    for (const [lang, config] of Object.entries(LANGUAGE_SIGNATURES)) {
        let score = 0;
        for (const pattern of config.patterns) {
            if (pattern.test(code)) score += 3;
        }
        for (const kw of config.keywords) {
            const count = (code.split(kw).length - 1);
            score += Math.min(count, 5);
        }
        scores[lang] = score;
    }

    const bestMatch = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    return bestMatch && bestMatch[1] > 0 ? bestMatch[0] : 'unknown';
}

/**
 * Extract structural metadata from code.
 */
function extractMetrics(code, language) {
    const lines = code.split('\n');
    const lineCount = lines.length;

    // Count non-empty, non-comment lines
    let codeLines = 0;
    let commentLines = 0;
    let blankLines = 0;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            blankLines++;
        } else if (
            trimmed.startsWith('//') ||
            trimmed.startsWith('#') ||
            trimmed.startsWith('*') ||
            trimmed.startsWith('/*') ||
            trimmed.startsWith('--')
        ) {
            commentLines++;
        } else {
            codeLines++;
        }
    }

    // Function/method count (rough heuristic)
    const functionPatterns = {
        python: /\bdef\s+\w+/g,
        javascript: /\b(?:function\s+\w+|\w+\s*=\s*(?:async\s+)?(?:\([^)]*\)|\w+)\s*=>)/g,
        typescript: /\b(?:function\s+\w+|\w+\s*=\s*(?:async\s+)?(?:\([^)]*\)|\w+)\s*=>)/g,
        java: /\b(?:public|private|protected|static)[\s\w<>[\]]*\s+\w+\s*\([^)]*\)\s*(?:throws\s+\w+\s*)?\{/g,
        cpp: /\b\w+[\s*]+\w+\s*\([^)]*\)\s*(?:const\s*)?\{/g,
        go: /\bfunc\s+\w+/g,
        rust: /\bfn\s+\w+/g,
        php: /\bfunction\s+\w+/g,
        ruby: /\bdef\s+\w+/g,
        csharp: /\b(?:public|private|protected|static|virtual|override)[\s\w<>[\]]*\s+\w+\s*\([^)]*\)\s*\{/g,
    };

    const funcPattern = functionPatterns[language] || /\bfunction\s+\w+|\bdef\s+\w+|\bfunc\s+\w+/g;
    const functionMatches = code.match(funcPattern) || [];
    const functionCount = functionMatches.length;

    // Class count
    const classPattern = /\bclass\s+\w+/g;
    const classCount = (code.match(classPattern) || []).length;

    // Import count
    const importPatterns = [
        /^import\s+/gm,
        /^from\s+\w+\s+import/gm,
        /^#include/gm,
        /require\s*\(/g,
        /^using\s+/gm,
        /^use\s+/gm
    ];
    let importCount = 0;
    for (const p of importPatterns) {
        importCount += (code.match(p) || []).length;
    }

    // Estimate cyclomatic complexity (rough)
    const branchPatterns = /\b(if|else|elif|for|while|switch|case|catch|&&|\|\||\?)\b/g;
    const branchCount = (code.match(branchPatterns) || []).length;
    const cyclomaticComplexity = 1 + branchCount;

    // Comment ratio
    const commentRatio = lineCount > 0 ? Math.round((commentLines / lineCount) * 100) : 0;

    return {
        lineCount,
        codeLines,
        commentLines,
        blankLines,
        functionCount,
        classCount,
        importCount,
        cyclomaticComplexity,
        commentRatio
    };
}

/**
 * Extract potential security red flags for pre-screening.
 */
function extractRedFlags(code, language) {
    const flags = [];

    const dangerousPatterns = [
        { pattern: /eval\s*\(/, name: 'eval() usage', severity: 'high' },
        { pattern: /exec\s*\(/, name: 'exec() call', severity: 'high' },
        { pattern: /password\s*=\s*["'][^"']+["']/i, name: 'Hardcoded password', severity: 'critical' },
        { pattern: /secret\s*=\s*["'][^"']+["']/i, name: 'Hardcoded secret', severity: 'critical' },
        { pattern: /api[_-]?key\s*=\s*["'][^"']+["']/i, name: 'Hardcoded API key', severity: 'critical' },
        { pattern: /token\s*=\s*["'][^"']+["']/i, name: 'Hardcoded token', severity: 'high' },
        { pattern: /md5\s*\(/i, name: 'Weak MD5 hash', severity: 'medium' },
        { pattern: /sha1\s*\(/i, name: 'Weak SHA1 hash', severity: 'medium' },
        { pattern: /http:\/\//i, name: 'Non-HTTPS URL', severity: 'low' },
        { pattern: /SELECT\s+\*\s+FROM.+\+/i, name: 'SQL string concatenation', severity: 'critical' },
        { pattern: /innerHTML\s*=/i, name: 'innerHTML assignment (XSS risk)', severity: 'high' },
        { pattern: /document\.write\s*\(/i, name: 'document.write() usage', severity: 'medium' },
        { pattern: /TODO|FIXME|HACK|XXX/, name: 'TODO/FIXME markers', severity: 'low' },
        { pattern: /catch\s*\([^)]*\)\s*\{\s*\}/, name: 'Empty catch block', severity: 'medium' },
        { pattern: /\bdelete\b.*\bwhere\b(?!\s+\w)/i, name: 'DELETE without WHERE clause', severity: 'critical' },
        { pattern: /subprocess\.call|os\.system/i, name: 'Shell command execution', severity: 'high' },
        { pattern: /\bpickle\b/i, name: 'Pickle deserialization (unsafe)', severity: 'high' },
        { pattern: /\bconsole\.log\b/i, name: 'console.log in production code', severity: 'low' },
        { pattern: /\bprint\s*\(/i, name: 'Debug print statement', severity: 'low' }
    ];

    for (const { pattern, name, severity } of dangerousPatterns) {
        if (pattern.test(code)) {
            const match = code.match(pattern);
            flags.push({ name, severity, sample: match ? match[0].substring(0, 60) : '' });
        }
    }

    return flags;
}

/**
 * Main code parser — entry point.
 */
export async function parseCode(code, languageHint = 'auto', filename = 'untitled') {
    const detectedLanguage = detectLanguage(code, languageHint, filename);
    const metrics = extractMetrics(code, detectedLanguage);
    const redFlags = extractRedFlags(code, detectedLanguage);

    return {
        code,
        filename,
        detectedLanguage,
        languageHint,
        metrics,
        redFlags,
        // Convenience aliases
        lineCount: metrics.lineCount,
        functionCount: metrics.functionCount,
        cyclomaticComplexity: metrics.cyclomaticComplexity,
        commentRatio: metrics.commentRatio
    };
}
