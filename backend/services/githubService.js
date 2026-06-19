// ═══════════════════════════════════════════════════════════════════════════
// WATERMARK: Copyright (c) 2026 Code Rakshak by arunkumarmeda27.
// Protected under MIT License. All copies must contain this watermark.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Code Rakshak — GitHub Fetcher Service
 * Interacts with GitHub API to download code files from public or private repos.
 */

const CODE_EXTENSIONS = new Set([
    '.py','.js','.jsx','.ts','.tsx','.mjs','.cjs',
    '.java','.cpp','.cc','.cxx','.c','.h','.hpp',
    '.go','.rs','.php','.rb','.cs','.swift','.kt','.scala',
    '.sh','.bash','.zsh','.sql','.html','.css','.scss','.sass',
    '.less','.vue','.svelte','.xml','.yaml','.yml','.toml',
    '.cfg','.ini','.env','.md','.graphql','.prisma'
]);

const SKIP_PATTERNS = [
    'node_modules', 'dist', 'build', '.next', 'out', 'coverage',
    '.git', '.cache', '__pycache__', '.venv', 'venv', 'vendor',
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
    'bun.lockb', '.ds_store', 'thumbs.db'
];

export function parseGithubUrl(repoUrl) {
    if (!repoUrl) throw new Error("GitHub repository URL is required");
    const cleanUrl = repoUrl.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, '');
    const parts = cleanUrl.split('/');
    if (parts.length < 2) {
        throw new Error("Invalid GitHub repository URL. Expected: 'owner/repo'");
    }
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, '');
    return { owner, repo };
}

async function getDefaultBranch(owner, repo, token) {
    const headers = {
        'User-Agent': 'Code-Rakshak-Scanner',
        'Accept': 'application/vnd.github.v3+json'
    };
    if (token) {
        headers['Authorization'] = `token ${token}`;
    }
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
    if (!res.ok) {
        if (res.status === 404) {
            throw new Error(`Repository '${owner}/${repo}' not found. If it is private, check your API token.`);
        }
        throw new Error(`GitHub API Error: ${res.statusText} (${res.status})`);
    }
    const data = await res.json();
    return data.default_branch || 'main';
}

async function getGitTree(owner, repo, branch, token) {
    const headers = {
        'User-Agent': 'Code-Rakshak-Scanner',
        'Accept': 'application/vnd.github.v3+json'
    };
    if (token) {
        headers['Authorization'] = `token ${token}`;
    }
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, { headers });
    if (!res.ok) {
        throw new Error(`Failed to retrieve branch '${branch}' file list: ${res.statusText}`);
    }
    const data = await res.json();
    return data.tree || [];
}

async function fetchFileContent(owner, repo, sha, token) {
    const headers = {
        'User-Agent': 'Code-Rakshak-Scanner',
        'Accept': 'application/vnd.github.v3+json'
    };
    if (token) {
        headers['Authorization'] = `token ${token}`;
    }
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs/${sha}`, { headers });
    if (!res.ok) {
        throw new Error(`Failed to fetch file content (SHA: ${sha})`);
    }
    const data = await res.json();
    if (data.encoding === 'base64') {
        return Buffer.from(data.content, 'base64').toString('utf8');
    }
    return data.content || '';
}

async function fetchAllFilesWithLimit(owner, repo, files, token, concurrencyLimit = 5) {
    const results = [];
    for (let i = 0; i < files.length; i += concurrencyLimit) {
        const chunk = files.slice(i, i + concurrencyLimit);
        const promises = chunk.map(async (file) => {
            try {
                const content = await fetchFileContent(owner, repo, file.sha, token);
                return {
                    name: file.path.substring(file.path.lastIndexOf('/') + 1),
                    path: file.path,
                    size: file.size || Buffer.byteLength(content, 'utf8'),
                    content
                };
            } catch (err) {
                console.error(`Error loading ${file.path}:`, err.message);
                return {
                    name: file.path.substring(file.path.lastIndexOf('/') + 1),
                    path: file.path,
                    size: 0,
                    content: `// Error loading file from GitHub: ${err.message}`
                };
            }
        });
        const chunkResults = await Promise.all(promises);
        results.push(...chunkResults);
    }
    return results;
}

function filterTreeFiles(tree) {
    const MAX_FILE_BYTES  = 5 * 1024 * 1024; // 5 MB
    const MAX_TOTAL_BYTES = 20 * 1024 * 1024; // 20 MB

    const files = tree.filter(node => {
        if (node.type !== 'blob') return false;

        const path = node.path.toLowerCase();
        const shouldSkip = SKIP_PATTERNS.some(p => path.includes(p));
        if (shouldSkip) return false;

        if (node.size && node.size > MAX_FILE_BYTES) return false;

        const lastDot = path.lastIndexOf('.');
        if (lastDot === -1) return false;
        const ext = path.substring(lastDot);
        return CODE_EXTENSIONS.has(ext);
    });

    const priority = [
        /\.(jsx?|tsx?)$/,
        /\.py$/,
        /\.java$/,
        /\.go$/,
        /\.rs$/
    ];

    const sorted = [...files].sort((a, b) => {
        const aScore = priority.findIndex(p => p.test(a.path.toLowerCase())) + 1 || 99;
        const bScore = priority.findIndex(p => p.test(b.path.toLowerCase())) + 1 || 99;
        return aScore - bScore;
    });

    let totalBytes = 0;
    const kept = [];
    const skipped = [];

    for (const file of sorted) {
        const size = file.size || 0;
        if (totalBytes + size > MAX_TOTAL_BYTES) {
            skipped.push(file.path);
        } else {
            kept.push(file);
            totalBytes += size;
        }
    }

    return { kept, skipped };
}

export async function fetchGithubRepo(repoUrl, branchName = '', token = '') {
    const { owner, repo } = parseGithubUrl(repoUrl);
    const branch = branchName.trim() || await getDefaultBranch(owner, repo, token);
    const tree = await getGitTree(owner, repo, branch, token);
    const { kept, skipped } = filterTreeFiles(tree);

    if (kept.length === 0) {
        throw new Error("No supported source code files found in the repository.");
    }

    const fetchedFiles = await fetchAllFilesWithLimit(owner, repo, kept, token, 8);

    // Merge into combined code string
    let combined = '';
    if (skipped.length > 0) {
        combined += `// ⚠️ Note: ${skipped.length} files were skipped due to the 20MB total size limit:\n`;
        combined += `// ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? ` +${skipped.length - 5} more` : ''}\n\n`;
    }

    for (const file of fetchedFiles) {
        combined += `\n${'='.repeat(60)}\n`;
        combined += `FILE: ${file.path}\n`;
        combined += `${'='.repeat(60)}\n`;
        combined += file.content + '\n';
    }

    return {
        combinedCode: combined.trim(),
        files: fetchedFiles.map(f => ({ name: f.name, size: f.size })),
        repoName: `${owner}/${repo}`,
        branch,
        skippedCount: skipped.length
    };
}
