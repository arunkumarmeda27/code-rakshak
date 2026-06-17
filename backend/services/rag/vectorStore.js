import Database from 'better-sqlite3';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'rag_memory.sqlite');
const patternsPath = path.join(__dirname, '..', 'data', 'cve_patterns.json');

let db;
let ai;

function getAI() {
    if (!ai) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey || apiKey.includes('dummy')) return null;
        ai = new GoogleGenAI({ apiKey });
    }
    return ai;
}

function initDb() {
    if (db) return db;
    // Connect to SQLite
    db = new Database(dbPath);
    
    // Create tables
    db.exec(`
        CREATE TABLE IF NOT EXISTS cve_patterns (
            id TEXT PRIMARY KEY,
            name TEXT,
            category TEXT,
            description TEXT,
            signature TEXT,
            cvss REAL,
            remediation TEXT,
            embedding_json TEXT
        );
    `);

    // Bootstrap data if empty
    const count = db.prepare('SELECT COUNT(*) as count FROM cve_patterns').get().count;
    if (count === 0 && fs.existsSync(patternsPath)) {
        try {
            const patterns = JSON.parse(fs.readFileSync(patternsPath, 'utf8'));
            const stmt = db.prepare(`
                INSERT INTO cve_patterns (id, name, category, description, signature, cvss, remediation)
                VALUES (@cveId, @name, @category, @description, @signature, @cvss, @remediation)
            `);
            const insertMany = db.transaction((items) => {
                for (const item of items) stmt.run(item);
            });
            insertMany(patterns);
            console.log(`[RAG] Bootstrapped ${patterns.length} patterns into SQLite.`);
        } catch (e) {
            console.error('[RAG] Failed to bootstrap patterns:', e.message);
        }
    }
    return db;
}

/**
 * Get embedding for text using Gemini text-embedding-004
 */
async function getEmbedding(text) {
    const aiInstance = getAI();
    if (!aiInstance) return null;
    
    try {
        const response = await aiInstance.models.embedContent({
            model: 'text-embedding-004',
            contents: text,
        });
        return response.embeddings[0].values;
    } catch (e) {
        console.warn(`[RAG] Embedding failed: ${e.message}`);
        return null;
    }
}

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Retrieve most relevant context (CVE Patterns) for a given analysis scenario
 */
export async function retrieveContext(htmlSnippet, toolResults) {
    initDb();
    
    // Construct query from tool findings
    const findingsSummary = [
        ...((toolResults.xss?.findings || []).map(f => f.type)),
        ...((toolResults.cookies?.findings || []).map(f => f.issue)),
        ...((toolResults.headers?.findings || []).filter(f => f.status === 'missing').map(f => `Missing ${f.header}`)),
    ].join(' ');

    const query = `Analysis revealed: ${findingsSummary}. Looking for similar CVEs.`;
    
    const queryEmbedding = await getEmbedding(query);
    if (!queryEmbedding) {
         // Fallback keyword matching if API fails
         const patterns = db.prepare('SELECT * FROM cve_patterns LIMIT 5').all();
         return formatContext(patterns);
    }

    // Embed missing database entries (lazy generation)
    const pendingEmbeds = db.prepare('SELECT id, description, category FROM cve_patterns WHERE embedding_json IS NULL').all();
    for (const pending of pendingEmbeds) {
        const emb = await getEmbedding(`[${pending.category}] ${pending.description}`);
        if (emb) {
            db.prepare('UPDATE cve_patterns SET embedding_json = ? WHERE id = ?').run(JSON.stringify(emb), pending.id);
        }
    }

    // Retrieve all and calculate similarity in JS (fast enough for <10k rows)
    const allRows = db.prepare('SELECT * FROM cve_patterns WHERE embedding_json IS NOT NULL').all();
    const ranked = allRows.map(row => {
        const vec = JSON.parse(row.embedding_json);
        return {
            ...row,
            score: cosineSimilarity(queryEmbedding, vec)
        };
    }).sort((a, b) => b.score - a.score);

    // Top 3 relevant matches
    const topMatches = ranked.slice(0, 3);
    return formatContext(topMatches);
}

function formatContext(patterns) {
    if (!patterns || patterns.length === 0) return "No relevant historical CVE context found.";
    
    let ctx = "### Past Similar Vulnerabilities (Reference Only):\n\n";
    for (const p of patterns) {
        ctx += `**${p.id}: ${p.name}**\n`;
        ctx += `- Category: ${p.category} | CVSS: ${p.cvss}\n`;
        ctx += `- Relevance Score: ${p.score ? p.score.toFixed(2) : 'N/A'}\n`;
        ctx += `- Description: ${p.description}\n`;
        ctx += `- Remediation: ${p.remediation}\n\n`;
    }
    return ctx;
}
