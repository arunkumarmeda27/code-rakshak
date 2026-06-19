/**
 * Code Rakshak — Code Analysis Orchestrator
 * Runs 4 AI agents sequentially, computes scores, and returns final report.
 */

import { runStaticAnalysisAgent } from './agents/staticAnalysisAgent.js';
import { runSecurityAuditAgent } from './agents/securityAuditAgent.js';
import { runQualityAgent } from './agents/qualityAgent.js';
import { runLoopholeAgent } from './agents/loopholeAgent.js';
import { synthesizeReport } from './agents/synthesizer.js';
import { scanForSecrets } from './secretsScanner.js';

/**
 * Compute strength and fairness scores from agent findings.
 */
function computeScores(agentOutputs, parsedCode) {
    const { staticAnalysis, securityAudit, quality, loopholes } = agentOutputs;

    // ── Strength Score (Security-focused) ──────────────────────────────────
    let strengthScore = 100;

    // Deduct for pre-screened red flags
    const redFlags = parsedCode.redFlags || [];
    for (const flag of redFlags) {
        if (flag.severity === 'critical') strengthScore -= 20;
        else if (flag.severity === 'high') strengthScore -= 12;
        else if (flag.severity === 'medium') strengthScore -= 6;
        else if (flag.severity === 'low') strengthScore -= 2;
    }

    // Deduct for cyclomatic complexity
    const complexity = parsedCode.cyclomaticComplexity || 1;
    if (complexity > 50) strengthScore -= 15;
    else if (complexity > 30) strengthScore -= 10;
    else if (complexity > 15) strengthScore -= 5;

    // Parse security deductions from AI output
    if (securityAudit && typeof securityAudit === 'string') {
        const critCount = (securityAudit.match(/CRITICAL/gi) || []).length;
        const highCount = (securityAudit.match(/HIGH/gi) || []).length;
        const medCount = (securityAudit.match(/MEDIUM/gi) || []).length;
        strengthScore -= critCount * 10 + highCount * 5 + medCount * 2;
    }

    strengthScore = Math.max(0, Math.min(100, Math.round(strengthScore)));

    // ── Fairness Score (Quality-focused) ───────────────────────────────────
    let fairnessScore = 100;

    // Comment ratio (good comments = bonus)
    const commentRatio = parsedCode.commentRatio || 0;
    if (commentRatio < 5) fairnessScore -= 15;
    else if (commentRatio < 10) fairnessScore -= 8;
    else if (commentRatio > 30) fairnessScore += 5; // well-documented

    // Complexity penalty
    if (complexity > 30) fairnessScore -= 15;
    else if (complexity > 15) fairnessScore -= 8;

    // Parse quality deductions from AI output
    if (quality && typeof quality === 'string') {
        const badNaming = (quality.match(/naming|readability|unclear/gi) || []).length;
        fairnessScore -= badNaming * 3;
        const dryConcern = (quality.match(/DRY|duplication|repeated/gi) || []).length;
        fairnessScore -= dryConcern * 4;
    }

    // Parse loophole deductions
    if (loopholes && typeof loopholes === 'string') {
        const bugCount = (loopholes.match(/BUG|LOGICAL|EDGE CASE/gi) || []).length;
        fairnessScore -= bugCount * 3;
    }

    fairnessScore = Math.max(0, Math.min(100, Math.round(fairnessScore)));

    // ── Overall Grade ─────────────────────────────────────────────────────
    const composite = Math.round((strengthScore + fairnessScore) / 2);
    let grade, gradeLabel;
    if (composite >= 90) { grade = 'A+'; gradeLabel = 'Excellent'; }
    else if (composite >= 80) { grade = 'A'; gradeLabel = 'Very Good'; }
    else if (composite >= 70) { grade = 'B'; gradeLabel = 'Good'; }
    else if (composite >= 60) { grade = 'C'; gradeLabel = 'Acceptable'; }
    else if (composite >= 50) { grade = 'D'; gradeLabel = 'Needs Work'; }
    else { grade = 'F'; gradeLabel = 'Critical Issues'; }

    // ── Vulnerability Summary ─────────────────────────────────────────────
    const vulnerabilityCount = {
        critical: redFlags.filter(f => f.severity === 'critical').length,
        high: redFlags.filter(f => f.severity === 'high').length,
        medium: redFlags.filter(f => f.severity === 'medium').length,
        low: redFlags.filter(f => f.severity === 'low').length,
        total: redFlags.length
    };

    return {
        strengthScore,
        fairnessScore,
        composite,
        grade,
        gradeLabel,
        vulnerabilityCount,
        metrics: {
            lineCount: parsedCode.metrics.lineCount,
            functionCount: parsedCode.metrics.functionCount,
            classCount: parsedCode.metrics.classCount,
            cyclomaticComplexity: parsedCode.metrics.cyclomaticComplexity,
            commentRatio: parsedCode.metrics.commentRatio,
            codeLines: parsedCode.metrics.codeLines,
            commentLines: parsedCode.metrics.commentLines
        }
    };
}

/**
 * Main code analysis orchestrator — entry point.
 */
export async function analyzeCode(parsedCode, onProgress) {
    const emit = (phase, message) => {
        if (onProgress) onProgress(phase, message);
    };

    const agentOutputs = {};

    // ── Secrets Scanning ─────────────────────────────────────────────────
    emit('analyze', '🔑 Scanning codebase for hardcoded secrets...');
    const secretsFindings = scanForSecrets(parsedCode.code, parsedCode.filename);
    
    // Filter out generic secret red flags from parser
    const cleanRedFlags = (parsedCode.redFlags || []).filter(
        f => !['Hardcoded password', 'Hardcoded secret', 'Hardcoded API key', 'Hardcoded token'].includes(f.name)
    );
    
    // Merge secrets findings into parsedCode's findings
    parsedCode.redFlags = [...cleanRedFlags, ...secretsFindings];
    
    if (secretsFindings.length > 0) {
        emit('analyze', `⚠️ Secrets scanner identified ${secretsFindings.length} credentials leak(s)`);
    } else {
        emit('analyze', '✅ Secrets scan clean (no leaks found)');
    }

    // ── Agent 1: Static Analysis ─────────────────────────────────────────
    emit('analyze', '🔬 Static Analysis Agent scanning code structure...');
    try {
        agentOutputs.staticAnalysis = await runStaticAnalysisAgent(parsedCode);
        emit('analyze', '✅ Static analysis complete');
    } catch (e) {
        agentOutputs.staticAnalysis = `Static analysis unavailable: ${e.message}`;
        emit('analyze', '⚠️ Static analysis agent encountered an error');
    }

    // ── Agent 2: Security Audit ─────────────────────────────────────────
    emit('analyze', '🔐 Security Audit Agent scanning for vulnerabilities...');
    try {
        agentOutputs.securityAudit = await runSecurityAuditAgent(parsedCode);
        emit('analyze', '✅ Security audit complete');
    } catch (e) {
        agentOutputs.securityAudit = `Security audit unavailable: ${e.message}`;
        emit('analyze', '⚠️ Security agent encountered an error');
    }

    // ── Agent 3: Quality Analysis ────────────────────────────────────────
    emit('analyze', '📐 Quality Agent evaluating code readability and maintainability...');
    try {
        agentOutputs.quality = await runQualityAgent(parsedCode);
        emit('analyze', '✅ Quality analysis complete');
    } catch (e) {
        agentOutputs.quality = `Quality analysis unavailable: ${e.message}`;
        emit('analyze', '⚠️ Quality agent encountered an error');
    }

    // ── Agent 4: Loophole Detection ─────────────────────────────────────
    emit('analyze', '🕵️ Loophole Agent hunting for bugs and edge cases...');
    try {
        agentOutputs.loopholes = await runLoopholeAgent(parsedCode);
        emit('analyze', '✅ Loophole detection complete');
    } catch (e) {
        agentOutputs.loopholes = `Loophole detection unavailable: ${e.message}`;
        emit('analyze', '⚠️ Loophole agent encountered an error');
    }

    // ── Score Computation ────────────────────────────────────────────────
    emit('score', '📊 Computing strength and fairness scores...');
    const scores = computeScores(agentOutputs, parsedCode);
    emit('score', `🎯 Strength: ${scores.strengthScore}/100 | Fairness: ${scores.fairnessScore}/100 | Grade: ${scores.grade}`);

    // ── Synthesis ────────────────────────────────────────────────────────
    emit('synthesize', '📝 Synthesizer composing final comprehensive report...');
    const report = await synthesizeReport(parsedCode, agentOutputs, scores);

    return {
        report,
        scores,
        findings: parsedCode.redFlags,
        agentOutputs
    };
}
