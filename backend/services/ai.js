import { routeToExperts } from './agents/routerAgent.js';
import { runWebExpert } from './agents/webExpert.js';
import { runInfraExpert } from './agents/infraExpert.js';
import { runApiExpert } from './agents/apiExpert.js';
import { synthesizeReport } from './agents/synthesizer.js';
// import { retrieveContext } from './rag/vectorStore.js'; // Will be added in Phase C
import dotenv from 'dotenv';
dotenv.config();

/**
 * Main AI Analysis Orchestrator
 * Maps to Phase 0: Router-Delegate Architecture
 */
export async function analyzeBugs(url, scrapedData, toolResults, onProgress) {
    const emit = (msg) => { if (onProgress) onProgress('ai', msg); };

    emit('🧠 Checking API key and initializing AI core...');
    const apiKey = process.env.GEMINI_API_KEY;
    const hasKey = apiKey && !apiKey.includes('dummy') && !apiKey.includes('your_');

    if (!hasKey) {
        emit('⚠️ No valid AI key found. Running offline synthesis mode...');
        return await synthesizeReport(url, {}, toolResults, null);
    }

    // ── 1. Routing Phase ────────────────────────────────────────────────────────
    emit('🚦 Router Agent analyzing tech stack for expert delegation...');
    const routing = await routeToExperts(url, scrapedData, toolResults);
    emit(`📋 Delegation plan: Web=${routing.webExpert}, Infra=${routing.infraExpert}, API=${routing.apiExpert}`);

    // ── 2. Retrieval Augmented Generation Phase ──────────────────────────────────
    emit('📚 Querying knowledge graph for relevant CVE patterns...');
    let cveContext = null;
    try {
        const { retrieveContext } = await import('./rag/vectorStore.js');
        cveContext = await retrieveContext(scrapedData.html || '', toolResults);
        if (cveContext) emit('✅ Relevant CVE context injected from memory module');
    } catch (e) {
        // RAG might fail if sqlite isn't set up yet, degrade gracefully
        console.warn('RAG Context retrieval skipped:', e.message);
    }

    // ── 3. Expert Execution Phase (Sequential to respect free tier limits) ──
    const expertOutputs = {};

    if (routing.webExpert) {
        emit('🕵️ Web Expert analyzing DOM, XSS, and CSRF vectors...');
        try {
            expertOutputs.web = await runWebExpert(url, scrapedData, toolResults);
            emit('✅ Web Expert analysis complete');
        } catch (e) {
            expertOutputs.web = `Error: ${e.message}`;
            emit('⚠️ Web Expert failed: ' + e.message);
        }
    }

    if (routing.infraExpert) {
        emit('🏗️ Infra Expert analyzing headers, TLS, and server config...');
        try {
            expertOutputs.infra = await runInfraExpert(url, scrapedData, toolResults);
            emit('✅ Infra Expert analysis complete');
        } catch (e) {
            expertOutputs.infra = `Error: ${e.message}`;
            emit('⚠️ Infra Expert failed: ' + e.message);
        }
    }

    if (routing.apiExpert) {
        emit('🔐 API Expert analyzing authentication and endpoints...');
        try {
            expertOutputs.api = await runApiExpert(url, scrapedData, toolResults);
            emit('✅ API Expert analysis complete');
        } catch (e) {
            expertOutputs.api = `Error: ${e.message}`;
            emit('⚠️ API Expert failed: ' + e.message);
        }
    }

    // ── 4. Synthesis Phase ──────────────────────────────────────────────────────
    emit('📝 Synthesizer Agent compiling final comprehensive report...');
    const finalReport = await synthesizeReport(url, expertOutputs, toolResults, cveContext);
    
    emit('✅ AI Analysis Complete');
    
    return finalReport;
}
