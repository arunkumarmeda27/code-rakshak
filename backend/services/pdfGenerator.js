/**
 * Code Rakshak — PDF Report Generator
 * Generates a professional, branded PDF analysis report.
 */

import PDFDocument from 'pdfkit';

// Brand Colors
const COLORS = {
    navy: '#0D1B2A',
    blue: '#1B3A6B',
    lightBlue: '#2563EB',
    amber: '#F5A623',
    gold: '#F0C040',
    white: '#FFFFFF',
    lightGray: '#F8F9FA',
    gray: '#6B7280',
    darkGray: '#374151',
    critical: '#DC2626',
    high: '#EA580C',
    medium: '#D97706',
    low: '#059669',
    success: '#10B981',
};

function getSeverityColor(severity) {
    const map = { critical: COLORS.critical, high: COLORS.high, medium: COLORS.medium, low: COLORS.low };
    return map[severity?.toLowerCase()] || COLORS.gray;
}

function getGradeColor(grade) {
    if (['A+', 'A'].includes(grade)) return COLORS.success;
    if (grade === 'B') return COLORS.lightBlue;
    if (grade === 'C') return COLORS.medium;
    if (grade === 'D') return COLORS.high;
    return COLORS.critical;
}

function getScoreColor(score) {
    if (score >= 80) return COLORS.success;
    if (score >= 60) return COLORS.amber;
    return COLORS.critical;
}

/**
 * Draw a filled rectangle.
 */
function drawRect(doc, x, y, w, h, color) {
    doc.save().rect(x, y, w, h).fill(color).restore();
}

/**
 * Draw a score bar (progress bar style).
 */
function drawScoreBar(doc, x, y, w, h, score, color) {
    // Background
    doc.save().rect(x, y, w, h).fill('#E5E7EB').restore();
    // Fill
    const fillW = Math.round((score / 100) * w);
    doc.save().rect(x, y, fillW, h).fill(color).restore();
    // Border
    doc.save().rect(x, y, w, h).stroke('#D1D5DB').restore();
}

/**
 * Main PDF generator.
 */
export async function generatePDF(parsedCode, report, scores, findings = []) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 0 });
            const chunks = [];

            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            const W = 595;
            const MARGIN = 40;
            const CONTENT_W = W - MARGIN * 2;

            // ── COVER PAGE ──────────────────────────────────────────────────
            // Background
            drawRect(doc, 0, 0, W, 842, COLORS.navy);

            // Top accent bar
            drawRect(doc, 0, 0, W, 6, COLORS.amber);

            // Shield icon area (simplified)
            doc.save()
               .circle(W / 2, 180, 60)
               .fill(COLORS.blue)
               .restore();

            doc.save()
               .fontSize(50)
               .fillColor(COLORS.amber)
               .text('🛡️', W / 2 - 30, 152)
               .restore();

            // Title
            doc.fontSize(36)
               .fillColor(COLORS.white)
               .font('Helvetica-Bold')
               .text('CODE RAKSHAK', MARGIN, 280, { align: 'center', width: CONTENT_W });

            doc.fontSize(14)
               .fillColor(COLORS.amber)
               .font('Helvetica')
               .text('Your Code\'s Guardian', MARGIN, 325, { align: 'center', width: CONTENT_W });

            // Divider
            drawRect(doc, MARGIN, 360, CONTENT_W, 2, COLORS.blue);

            // File info
            doc.fontSize(12)
               .fillColor(COLORS.lightGray)
               .text(`Analysis Report`, MARGIN, 380, { align: 'center', width: CONTENT_W });

            doc.fontSize(16)
               .fillColor(COLORS.white)
               .font('Helvetica-Bold')
               .text(parsedCode.filename || 'Code Analysis', MARGIN, 405, { align: 'center', width: CONTENT_W });

            doc.fontSize(11)
               .fillColor(COLORS.gray)
               .font('Helvetica')
               .text(`Language: ${(parsedCode.detectedLanguage || 'Unknown').toUpperCase()}`, MARGIN, 435, { align: 'center', width: CONTENT_W });

            // Grade badge
            const gradeColor = getGradeColor(scores.grade);
            drawRect(doc, W / 2 - 50, 480, 100, 70, gradeColor);
            doc.fontSize(36)
               .fillColor(COLORS.white)
               .font('Helvetica-Bold')
               .text(scores.grade, W / 2 - 50, 490, { align: 'center', width: 100 });

            doc.fontSize(10)
               .fillColor(COLORS.white)
               .font('Helvetica')
               .text(scores.gradeLabel || '', W / 2 - 50, 532, { align: 'center', width: 100 });

            // Score summary
            const scoreY = 590;
            // Strength
            drawRect(doc, MARGIN, scoreY, 155, 70, COLORS.blue);
            doc.fontSize(9).fillColor(COLORS.amber).font('Helvetica-Bold')
               .text('🔒 STRENGTH', MARGIN, scoreY + 8, { align: 'center', width: 155 });
            doc.fontSize(28).fillColor(COLORS.white).font('Helvetica-Bold')
               .text(`${scores.strengthScore}`, MARGIN, scoreY + 22, { align: 'center', width: 155 });
            doc.fontSize(9).fillColor(COLORS.gray).font('Helvetica')
               .text('out of 100', MARGIN, scoreY + 54, { align: 'center', width: 155 });

            // Fairness
            drawRect(doc, W / 2 - 77, scoreY, 155, 70, COLORS.blue);
            doc.fontSize(9).fillColor(COLORS.amber).font('Helvetica-Bold')
               .text('⚖️ FAIRNESS', W / 2 - 77, scoreY + 8, { align: 'center', width: 155 });
            doc.fontSize(28).fillColor(COLORS.white).font('Helvetica-Bold')
               .text(`${scores.fairnessScore}`, W / 2 - 77, scoreY + 22, { align: 'center', width: 155 });
            doc.fontSize(9).fillColor(COLORS.gray).font('Helvetica')
               .text('out of 100', W / 2 - 77, scoreY + 54, { align: 'center', width: 155 });

            // Composite
            drawRect(doc, W - MARGIN - 155, scoreY, 155, 70, COLORS.blue);
            doc.fontSize(9).fillColor(COLORS.amber).font('Helvetica-Bold')
               .text('🎯 COMPOSITE', W - MARGIN - 155, scoreY + 8, { align: 'center', width: 155 });
            doc.fontSize(28).fillColor(COLORS.white).font('Helvetica-Bold')
               .text(`${scores.composite}`, W - MARGIN - 155, scoreY + 22, { align: 'center', width: 155 });
            doc.fontSize(9).fillColor(COLORS.gray).font('Helvetica')
               .text('out of 100', W - MARGIN - 155, scoreY + 54, { align: 'center', width: 155 });

            // Vulnerability counts
            const vulnY = 690;
            doc.fontSize(10).fillColor(COLORS.white).font('Helvetica-Bold')
               .text('VULNERABILITIES FOUND', MARGIN, vulnY, { align: 'center', width: CONTENT_W });

            const vulnItems = [
                { label: 'Critical', count: scores.vulnerabilityCount.critical, color: COLORS.critical },
                { label: 'High', count: scores.vulnerabilityCount.high, color: COLORS.high },
                { label: 'Medium', count: scores.vulnerabilityCount.medium, color: COLORS.medium },
                { label: 'Low', count: scores.vulnerabilityCount.low, color: COLORS.low }
            ];
            const boxW = (CONTENT_W - 30) / 4;
            vulnItems.forEach((item, i) => {
                const bx = MARGIN + i * (boxW + 10);
                drawRect(doc, bx, vulnY + 20, boxW, 55, item.color);
                doc.fontSize(22).fillColor(COLORS.white).font('Helvetica-Bold')
                   .text(String(item.count), bx, vulnY + 27, { align: 'center', width: boxW });
                doc.fontSize(8).fillColor(COLORS.white).font('Helvetica')
                   .text(item.label, bx, vulnY + 55, { align: 'center', width: boxW });
            });

            // Date
            doc.fontSize(9).fillColor(COLORS.gray)
               .text(`Generated: ${new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}`, MARGIN, 780, { align: 'center', width: CONTENT_W });

            // Bottom bar
            drawRect(doc, 0, 836, W, 6, COLORS.amber);

            // ── METRICS PAGE ────────────────────────────────────────────────
            doc.addPage({ margin: 0 });
            drawRect(doc, 0, 0, W, 842, COLORS.white);
            drawRect(doc, 0, 0, W, 6, COLORS.amber);

            // Header
            drawRect(doc, 0, 6, W, 55, COLORS.navy);
            doc.fontSize(18).fillColor(COLORS.white).font('Helvetica-Bold')
               .text('📊 Code Metrics & Analysis', MARGIN, 22, { width: CONTENT_W });
            doc.fontSize(10).fillColor(COLORS.amber)
               .text(`Code Rakshak | ${parsedCode.filename}`, MARGIN, 44, { width: CONTENT_W });

            let y = 90;

            // Score bars section
            doc.fontSize(14).fillColor(COLORS.navy).font('Helvetica-Bold')
               .text('Performance Scores', MARGIN, y);
            y += 30;

            const bars = [
                { label: '🔒 Strength Score', score: scores.strengthScore, color: getScoreColor(scores.strengthScore) },
                { label: '⚖️ Fairness Score', score: scores.fairnessScore, color: getScoreColor(scores.fairnessScore) },
                { label: '🎯 Composite Score', score: scores.composite, color: getScoreColor(scores.composite) }
            ];

            for (const bar of bars) {
                doc.fontSize(10).fillColor(COLORS.darkGray).font('Helvetica-Bold')
                   .text(bar.label, MARGIN, y);
                doc.fontSize(10).fillColor(bar.color).font('Helvetica-Bold')
                   .text(`${bar.score}/100`, W - MARGIN - 50, y, { width: 50, align: 'right' });
                y += 16;
                drawScoreBar(doc, MARGIN, y, CONTENT_W, 14, bar.score, bar.color);
                y += 25;
            }

            y += 10;
            drawRect(doc, MARGIN, y, CONTENT_W, 1, '#E5E7EB');
            y += 20;

            // Metrics table
            doc.fontSize(14).fillColor(COLORS.navy).font('Helvetica-Bold')
               .text('Code Statistics', MARGIN, y);
            y += 25;

            const metrics = [
                { label: 'Total Lines', value: parsedCode.metrics?.lineCount || 0 },
                { label: 'Code Lines', value: parsedCode.metrics?.codeLines || 0 },
                { label: 'Comment Lines', value: parsedCode.metrics?.commentLines || 0 },
                { label: 'Functions Detected', value: parsedCode.metrics?.functionCount || 0 },
                { label: 'Classes Detected', value: parsedCode.metrics?.classCount || 0 },
                { label: 'Cyclomatic Complexity', value: parsedCode.metrics?.cyclomaticComplexity || 1 },
                { label: 'Comment Ratio', value: `${parsedCode.metrics?.commentRatio || 0}%` },
            ];

            const colW = CONTENT_W / 2 - 10;
            metrics.forEach((m, i) => {
                const col = i % 2;
                const row = Math.floor(i / 2);
                const mx = MARGIN + col * (colW + 20);
                const my = y + row * 32;

                if (i % 2 === 0) {
                    drawRect(doc, mx, my - 4, CONTENT_W, 28, i % 4 === 0 ? '#F9FAFB' : COLORS.white);
                }
                doc.fontSize(10).fillColor(COLORS.gray).font('Helvetica')
                   .text(m.label, mx + 5, my + 4);
                doc.fontSize(10).fillColor(COLORS.navy).font('Helvetica-Bold')
                   .text(String(m.value), mx + 5, my + 4, { align: 'right', width: colW - 10 });
            });

            y += Math.ceil(metrics.length / 2) * 32 + 20;

            // Vulnerability breakdown
            drawRect(doc, MARGIN, y, CONTENT_W, 1, '#E5E7EB');
            y += 20;
            doc.fontSize(14).fillColor(COLORS.navy).font('Helvetica-Bold')
               .text('Vulnerability Breakdown', MARGIN, y);
            y += 25;

            const vulnRows = [
                { label: '🔴 Critical', count: scores.vulnerabilityCount.critical, color: COLORS.critical },
                { label: '🟠 High', count: scores.vulnerabilityCount.high, color: COLORS.high },
                { label: '🟡 Medium', count: scores.vulnerabilityCount.medium, color: COLORS.medium },
                { label: '🟢 Low', count: scores.vulnerabilityCount.low, color: COLORS.low },
            ];

            for (const row of vulnRows) {
                drawRect(doc, MARGIN, y - 2, CONTENT_W, 24, '#F9FAFB');
                drawRect(doc, MARGIN, y - 2, 4, 24, row.color);
                doc.fontSize(10).fillColor(COLORS.darkGray).font('Helvetica')
                   .text(row.label, MARGIN + 15, y + 4);
                doc.fontSize(10).fillColor(row.color).font('Helvetica-Bold')
                   .text(String(row.count), MARGIN + 15, y + 4, { align: 'right', width: CONTENT_W - 15 });
                y += 28;
            }

            // Pre-screened findings
            if (findings && findings.length > 0) {
                y += 10;
                drawRect(doc, MARGIN, y, CONTENT_W, 1, '#E5E7EB');
                y += 20;
                doc.fontSize(14).fillColor(COLORS.navy).font('Helvetica-Bold')
                   .text('Pre-Screened Security Flags', MARGIN, y);
                y += 25;

                for (const finding of findings.slice(0, 8)) {
                    if (y > 750) break;
                    const c = getSeverityColor(finding.severity);
                    drawRect(doc, MARGIN, y - 2, CONTENT_W, 22, '#F9FAFB');
                    drawRect(doc, MARGIN, y - 2, 4, 22, c);
                    doc.fontSize(9).fillColor(c).font('Helvetica-Bold')
                       .text(`[${finding.severity.toUpperCase()}]`, MARGIN + 10, y + 4, { width: 65 });
                    doc.fontSize(9).fillColor(COLORS.darkGray).font('Helvetica')
                       .text(finding.name, MARGIN + 80, y + 4, { width: CONTENT_W - 80, ellipsis: true });
                    y += 26;
                }
            }

            // ── REPORT PAGE(S) ───────────────────────────────────────────────
            doc.addPage({ margin: MARGIN });
            drawRect(doc, 0, 0, W, 6, COLORS.amber);

            // Header
            drawRect(doc, 0, 6, W, 55, COLORS.navy);
            doc.fontSize(18).fillColor(COLORS.white).font('Helvetica-Bold')
               .text('📋 Detailed Analysis Report', MARGIN, 22, { width: CONTENT_W });
            doc.fontSize(10).fillColor(COLORS.amber)
               .text('Code Rakshak | AI-Powered Code Analysis', MARGIN, 44, { width: CONTENT_W });

            doc.y = 80;
            doc.x = MARGIN;

            // Render the report text
            if (report) {
                const lines = report.split('\n');
                for (const line of lines) {
                    if (doc.y > 790) {
                        doc.addPage({ margin: MARGIN });
                        doc.y = MARGIN;
                    }

                    const trimmed = line.trim();
                    if (trimmed.startsWith('# ')) {
                        doc.fontSize(16).fillColor(COLORS.navy).font('Helvetica-Bold')
                           .text(trimmed.substring(2), MARGIN, doc.y, { width: CONTENT_W });
                        doc.moveDown(0.3);
                    } else if (trimmed.startsWith('## ')) {
                        doc.moveDown(0.3);
                        doc.fontSize(13).fillColor(COLORS.blue).font('Helvetica-Bold')
                           .text(trimmed.substring(3), MARGIN, doc.y, { width: CONTENT_W });
                        doc.moveDown(0.2);
                    } else if (trimmed.startsWith('### ')) {
                        doc.fontSize(11).fillColor(COLORS.navy).font('Helvetica-Bold')
                           .text(trimmed.substring(4), MARGIN, doc.y, { width: CONTENT_W });
                        doc.moveDown(0.2);
                    } else if (trimmed.startsWith('---')) {
                        doc.moveDown(0.3);
                        drawRect(doc, MARGIN, doc.y, CONTENT_W, 1, '#E5E7EB');
                        doc.moveDown(0.5);
                    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                        doc.fontSize(9).fillColor(COLORS.darkGray).font('Helvetica')
                           .text(`• ${trimmed.substring(2)}`, MARGIN + 10, doc.y, { width: CONTENT_W - 10 });
                        doc.moveDown(0.2);
                    } else if (trimmed.match(/^\d+\./)) {
                        doc.fontSize(9).fillColor(COLORS.darkGray).font('Helvetica')
                           .text(trimmed, MARGIN + 10, doc.y, { width: CONTENT_W - 10 });
                        doc.moveDown(0.2);
                    } else if (trimmed.startsWith('|')) {
                        // Table row — simplified
                        doc.fontSize(8).fillColor(COLORS.gray).font('Courier')
                           .text(trimmed, MARGIN, doc.y, { width: CONTENT_W });
                        doc.moveDown(0.15);
                    } else if (trimmed.startsWith('```')) {
                        // Code block marker — skip
                    } else if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
                        doc.fontSize(10).fillColor(COLORS.navy).font('Helvetica-Bold')
                           .text(trimmed.replace(/\*\*/g, ''), MARGIN, doc.y, { width: CONTENT_W });
                        doc.moveDown(0.2);
                    } else if (trimmed.length > 0) {
                        // Clean markdown for plain text
                        const clean = trimmed
                            .replace(/\*\*(.*?)\*\*/g, '$1')
                            .replace(/\*(.*?)\*/g, '$1')
                            .replace(/`(.*?)`/g, '$1');
                        doc.fontSize(9).fillColor(COLORS.darkGray).font('Helvetica')
                           .text(clean, MARGIN, doc.y, { width: CONTENT_W });
                        doc.moveDown(0.2);
                    } else {
                        doc.moveDown(0.2);
                    }
                }
            }

            // ── FOOTER on last page ─────────────────────────────────────────
            const pageRange = doc.bufferedPageRange();
            const totalPages = pageRange.start + pageRange.count;

            for (let i = pageRange.start; i < totalPages; i++) {
                doc.switchToPage(i);
                drawRect(doc, 0, 830, W, 12, COLORS.navy);
                doc.fontSize(7).fillColor(COLORS.amber)
                   .text(
                       `Code Rakshak — Your Code's Guardian | Page ${i + 1} of ${totalPages} | ${new Date().toLocaleDateString()}`,
                       MARGIN, 832, { align: 'center', width: CONTENT_W }
                   );
            }

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}
