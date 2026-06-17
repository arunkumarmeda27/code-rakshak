import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { parseCode } from './services/codeParser.js';
import { analyzeCode } from './services/codeAnalyzer.js';
import { applyConstitutionalFilter } from './services/constitutionalFilter.js';
import { generatePDF } from './services/pdfGenerator.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Allow multiple frontend URLs
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`Not allowed by CORS: ${origin}`));
        }
    },
    credentials: true
}));

app.use(express.json({ limit: '600kb' })); // 600KB to handle multi-file uploads

// Max combined code size — 400KB
const MAX_CODE_SIZE = 400 * 1024;
const activeAnalyses = new Map();
// { analysisId: { status: 'running'|'done'|'error', pdfBuffer: null, clients: Set<response>, resultContent: string, scores: {} } }

const MAX_CODE_SIZE = 50 * 1024; // 50KB

const SUPPORTED_LANGUAGES = [
    'javascript', 'typescript', 'python', 'java', 'cpp', 'c',
    'go', 'rust', 'php', 'ruby', 'csharp', 'swift', 'kotlin', 'auto'
];

function validateCodeInput(code, language) {
    if (!code || typeof code !== 'string') {
        return 'Code is required and must be a string';
    }
    if (code.trim().length === 0) {
        return 'Code cannot be empty';
    }
    if (Buffer.byteLength(code, 'utf8') > MAX_CODE_SIZE) {
        return `Code exceeds maximum size of ${MAX_CODE_SIZE / 1024}KB`;
    }
    if (language && !SUPPORTED_LANGUAGES.includes(language.toLowerCase())) {
        return `Unsupported language. Supported: ${SUPPORTED_LANGUAGES.join(', ')}`;
    }
    return null;
}

// ── Health Check ─────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'Code Rakshak API',
        version: '2.0.0',
        timestamp: new Date().toISOString()
    });
});

// ── Get Supported Languages ──────────────────────────────────────────────
app.get('/api/languages', (req, res) => {
    res.json({ languages: SUPPORTED_LANGUAGES });
});

// ── 1. Start Code Analysis ────────────────────────────────────────────────
app.post('/api/analyze/start', async (req, res) => {
    const { code, language = 'auto', filename = 'untitled' } = req.body;

    const validationError = validateCodeInput(code, language);
    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    const analysisId = crypto.randomUUID();
    activeAnalyses.set(analysisId, {
        status: 'running',
        clients: new Set(),
        pdfBuffer: null,
        resultContent: null,
        scores: null,
        code,
        language,
        filename,
        startTime: Date.now()
    });

    res.json({ analysisId });

    // Run analysis in background
    runAnalysisBackground(analysisId, code, language, filename);
});

// ── 2. SSE Stream ─────────────────────────────────────────────────────────
app.get('/api/analyze/:analysisId/stream', (req, res) => {
    const { analysisId } = req.params;
    const analysis = activeAnalyses.get(analysisId);

    if (!analysis) {
        return res.status(404).json({ error: 'Analysis session not found' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    analysis.clients.add(res);

    // Send initial ping
    res.write(`data: ${JSON.stringify({ phase: 'init', message: '🛡️ Code Rakshak connected — analysis starting...' })}\n\n`);

    // If already done, send completion immediately
    if (analysis.status === 'done') {
        res.write(`data: ${JSON.stringify({
            phase: 'complete',
            message: 'Analysis complete',
            report: analysis.resultContent,
            scores: analysis.scores
        })}\n\n`);
        analysis.clients.delete(res);
        res.end();
    } else if (analysis.status === 'error') {
        res.write(`data: ${JSON.stringify({ phase: 'error', message: analysis.errorMsg })}\n\n`);
        analysis.clients.delete(res);
        res.end();
    }

    req.on('close', () => {
        analysis.clients.delete(res);
    });
});

// ── 3. Download PDF Report ────────────────────────────────────────────────
app.get('/api/analyze/:analysisId/report', (req, res) => {
    const { analysisId } = req.params;
    const analysis = activeAnalyses.get(analysisId);

    if (!analysis || analysis.status !== 'done' || !analysis.pdfBuffer) {
        return res.status(404).json({ error: 'Report not ready or not found' });
    }

    const safeName = analysis.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=rakshak_report_${safeName}_${Date.now()}.pdf`);
    res.send(analysis.pdfBuffer);
});

// ── Background Analysis Logic ─────────────────────────────────────────────
async function runAnalysisBackground(analysisId, code, language, filename) {
    const analysis = activeAnalyses.get(analysisId);

    const emit = (phase, message, extra = {}) => {
        const payload = JSON.stringify({ phase, message, ...extra });
        for (const client of analysis.clients) {
            client.write(`data: ${payload}\n\n`);
        }
    };

    try {
        // Phase 1: Parse
        emit('parse', '🔍 Parsing code and detecting language...');
        const parsedCode = await parseCode(code, language, filename);
        emit('parse', `✅ Detected: ${parsedCode.detectedLanguage} | Lines: ${parsedCode.lineCount} | Functions: ${parsedCode.functionCount}`);

        // Phase 2: Analysis
        emit('analyze', '🤖 Running AI analysis agents...');
        const analysisResult = await analyzeCode(parsedCode, emit);

        // Phase 3: Filter
        emit('filter', '🛡️ Applying Code Rakshak safety filter...');
        const filteredReport = applyConstitutionalFilter(analysisResult.report);

        // Phase 4: PDF
        emit('pdf', '📄 Compiling your security report PDF...');
        const pdfBuffer = await generatePDF(parsedCode, filteredReport, analysisResult.scores, analysisResult.findings);

        // Store results
        analysis.status = 'done';
        analysis.pdfBuffer = pdfBuffer;
        analysis.resultContent = filteredReport;
        analysis.scores = analysisResult.scores;

        emit('complete', '✅ Code Rakshak analysis complete!', {
            report: filteredReport,
            scores: analysisResult.scores,
            findings: analysisResult.findings
        });

        // Close all SSE connections
        for (const client of analysis.clients) {
            client.end();
        }
        analysis.clients.clear();

    } catch (error) {
        console.error(`[Analysis ${analysisId}] Error:`, error);
        analysis.status = 'error';
        analysis.errorMsg = error.message;
        emit('error', `Analysis failed: ${error.message}`);

        for (const client of analysis.clients) {
            client.end();
        }
        analysis.clients.clear();
    }
}

app.listen(PORT, () => {
    console.log(`🛡️  Code Rakshak backend running on http://localhost:${PORT}`);
});
