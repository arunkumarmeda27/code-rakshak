import { useState, useRef, useCallback, useEffect } from 'react';
import './index.css';

const API_BASE = 'http://localhost:3000';

const LANGUAGES = [
  { value: 'auto', label: '🔍 Auto-Detect' },
  { value: 'python', label: '🐍 Python' },
  { value: 'javascript', label: '🟨 JavaScript' },
  { value: 'typescript', label: '🔷 TypeScript' },
  { value: 'java', label: '☕ Java' },
  { value: 'cpp', label: '⚙️ C++' },
  { value: 'c', label: '🔵 C' },
  { value: 'go', label: '🐹 Go' },
  { value: 'rust', label: '🦀 Rust' },
  { value: 'php', label: '🐘 PHP' },
  { value: 'ruby', label: '💎 Ruby' },
  { value: 'csharp', label: '💠 C#' },
];

const ANALYSIS_PHASES = [
  { id: 'parse',     icon: '🔍', name: 'Code Parser',        desc: 'Detecting language & extracting metrics' },
  { id: 'analyze',   icon: '🤖', name: 'AI Agents (×4)',     desc: 'Static, Security, Quality, Loophole' },
  { id: 'score',     icon: '📊', name: 'Score Engine',       desc: 'Computing strength & fairness scores' },
  { id: 'synthesize',icon: '📝', name: 'Report Synthesizer', desc: 'Generating easy-to-read report' },
  { id: 'filter',    icon: '🛡️', name: 'Safety Filter',      desc: 'Validating report content' },
  { id: 'pdf',       icon: '📄', name: 'PDF Compiler',       desc: 'Building downloadable report' },
];

// Allowed source-code extensions
const CODE_EXTENSIONS = new Set([
  '.py','.js','.jsx','.ts','.tsx','.java','.cpp','.cc','.cxx',
  '.c','.h','.hpp','.go','.rs','.php','.rb','.cs','.swift',
  '.kt','.scala','.sh','.bash','.sql','.html','.css','.xml',
  '.json','.yaml','.yml','.toml','.cfg','.ini','.env','.md','.txt'
]);

const MAX_TOTAL_KB = 400; // 400 KB combined

const SAMPLE_CODE = `# Sample Python code — paste yours or upload files!
import sqlite3
import hashlib

# ⚠️ Vulnerable example code for demonstration
password = "admin123"  # Hardcoded password!
api_key = "sk-abc123xyz789"  # Hardcoded API key!

def get_user(username):
    conn = sqlite3.connect('users.db')
    # SQL Injection vulnerability!
    query = "SELECT * FROM users WHERE name = '" + username + "'"
    cursor = conn.execute(query)
    return cursor.fetchone()

def hash_password(pwd):
    # Weak MD5 hash!
    return hashlib.md5(pwd.encode()).hexdigest()

def login(username, password):
    user = get_user(username)
    if user:
        hashed = hash_password(password)
        if hashed == user[2]:
            return True
    return False  # Empty error handling!

def delete_all():
    conn = sqlite3.connect('users.db')
    # DELETE without WHERE clause!
    conn.execute("DELETE FROM users")
    conn.commit()
`;

// ── Simple Markdown Renderer ─────────────────────────────────────────────
function MarkdownRenderer({ content }) {
  if (!content) return null;

  const lines = content.split('\n');
  const elements = [];
  let inCodeBlock = false;
  let codeLines = [];
  let codeKey = 0;

  const processInline = (text) => {
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    return text;
  };

  lines.forEach((line, i) => {
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${codeKey++}`}>
            <code>{codeLines.join('\n')}</code>
          </pre>
        );
        codeLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      return;
    }
    if (inCodeBlock) { codeLines.push(line); return; }

    if (line.startsWith('# ')) {
      elements.push(<h1 key={i} dangerouslySetInnerHTML={{ __html: processInline(line.slice(2)) }} />);
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i} dangerouslySetInnerHTML={{ __html: processInline(line.slice(3)) }} />);
    } else if (line.startsWith('### ')) {
      elements.push(<h3 key={i} dangerouslySetInnerHTML={{ __html: processInline(line.slice(4)) }} />);
    } else if (line.startsWith('#### ')) {
      elements.push(<h3 key={i} dangerouslySetInnerHTML={{ __html: processInline(line.slice(5)) }} />);
    } else if (line.match(/^---+$/)) {
      elements.push(<hr key={i} />);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(<ul key={i}><li dangerouslySetInnerHTML={{ __html: processInline(line.slice(2)) }} /></ul>);
    } else if (line.match(/^\d+\. /)) {
      elements.push(<ol key={i}><li dangerouslySetInnerHTML={{ __html: processInline(line.replace(/^\d+\. /, '')) }} /></ol>);
    } else if (line.startsWith('|')) {
      const cells = line.split('|').filter(c => c.trim() && !c.match(/^[\s-]+$/));
      if (cells.length > 0 && !line.match(/^\|[\s-|]+\|$/)) {
        elements.push(
          <table key={i}><tbody><tr>
            {cells.map((cell, ci) => <td key={ci} dangerouslySetInnerHTML={{ __html: processInline(cell.trim()) }} />)}
          </tr></tbody></table>
        );
      }
    } else if (line.trim()) {
      elements.push(<p key={i} dangerouslySetInnerHTML={{ __html: processInline(line) }} />);
    }
  });

  return <div className="markdown-body">{elements}</div>;
}

// ── Score Circle ─────────────────────────────────────────────────────────
function ScoreCircle({ score, type, label, desc }) {
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score / 100) * circumference;
  return (
    <div className={`score-card ${type}`}>
      <div className="score-circle-wrap">
        <svg className="score-circle-svg" viewBox="0 0 120 120">
          <circle className="score-circle-bg" cx="60" cy="60" r="54" />
          <circle
            className={`score-circle-fill ${type}`}
            cx="60" cy="60" r="54"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4,0,0.2,1)' }}
          />
        </svg>
        <div className="score-circle-text">
          <div className="score-number">{score}</div>
          <div className="score-label-small">/ 100</div>
        </div>
      </div>
      <div className="score-title">{label}</div>
      <div className="score-desc">{desc}</div>
    </div>
  );
}

// ── Grade Card ───────────────────────────────────────────────────────────
function GradeCard({ grade, gradeLabel, composite }) {
  const gradeClass = grade ? `grade-${grade.replace('+', '-plus')}` : 'grade-F';
  return (
    <div className="score-card grade">
      <div className={`grade-badge-large ${gradeClass}`}>{grade}</div>
      <div className="grade-label">{gradeLabel}</div>
      <div className="score-title">Overall Grade</div>
      <div className="score-desc">Composite score: {composite}/100</div>
    </div>
  );
}

// ── File List Badge ───────────────────────────────────────────────────────
function FileListBadge({ files, onClear }) {
  if (!files || files.length === 0) return null;
  const totalKB = (files.reduce((sum, f) => sum + f.size, 0) / 1024).toFixed(1);
  return (
    <div className="file-list-badge">
      <span className="file-list-icon">📁</span>
      <div className="file-list-info">
        <strong>{files.length} file{files.length > 1 ? 's' : ''} loaded</strong>
        <span className="file-list-names">
          {files.slice(0, 3).map(f => f.name).join(', ')}
          {files.length > 3 ? ` +${files.length - 3} more` : ''}
        </span>
        <span className="file-list-size">{totalKB} KB total</span>
      </div>
      <button className="file-list-clear" onClick={onClear} title="Clear files">✕</button>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────
export default function App() {
  const [code, setCode] = useState(SAMPLE_CODE);
  const [language, setLanguage] = useState('auto');
  const [filename, setFilename] = useState('example.py');
  const [loadedFiles, setLoadedFiles] = useState([]);   // [{name, size}]
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisId, setAnalysisId] = useState(null);
  const [phases, setPhases] = useState({});
  const [logs, setLogs] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('report');
  const [isDownloading, setIsDownloading] = useState(false);

  const singleFileRef = useRef(null);
  const folderFileRef = useRef(null);
  const multiFileRef = useRef(null);
  const logsEndRef = useRef(null);
  const eventSourceRef = useRef(null);

  const lineCount = code.split('\n').length;
  const charCount = code.length;

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = useCallback((phase, message) => {
    setLogs(prev => [...prev.slice(-49), { phase, message }]);
  }, []);

  const setPhaseStatus = useCallback((phase, status) => {
    setPhases(prev => ({ ...prev, [phase]: status }));
  }, []);

  // ── Multi-file handler ─────────────────────────────────────────────────
  const handleFiles = useCallback((fileList) => {
    const files = Array.from(fileList).filter(f => {
      const ext = f.name.substring(f.name.lastIndexOf('.')).toLowerCase();
      return CODE_EXTENSIONS.has(ext) && f.size < 200 * 1024; // skip >200KB individual files
    });

    if (files.length === 0) {
      alert('No supported code files found. Supported: .py, .js, .ts, .java, .cpp, .go, .rs, .php, .rb, .cs and more.');
      return;
    }

    // Read all files and combine
    const readers = files.map(file => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve({ name: file.name, size: file.size, content: e.target.result });
      reader.readAsText(file);
    }));

    Promise.all(readers).then(results => {
      // Check combined size
      const totalBytes = results.reduce((sum, r) => sum + r.size, 0);
      if (totalBytes > MAX_TOTAL_KB * 1024) {
        alert(`Total file size exceeds ${MAX_TOTAL_KB}KB. Please select fewer files.`);
        return;
      }

      // Combine all files with clear separators
      let combined = '';
      for (const r of results) {
        combined += `\n${'='.repeat(60)}\n`;
        combined += `FILE: ${r.name}\n`;
        combined += `${'='.repeat(60)}\n`;
        combined += r.content + '\n';
      }

      const displayName = results.length === 1
        ? results[0].name
        : `${results.length} files (${results[0].name}…)`;

      setCode(combined.trim());
      setFilename(displayName);
      setLoadedFiles(results.map(r => ({ name: r.name, size: r.size })));
    });
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDragOver = useCallback((e) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const clearFiles = useCallback(() => {
    setLoadedFiles([]);
    setCode(SAMPLE_CODE);
    setFilename('example.py');
  }, []);

  // ── Start analysis ─────────────────────────────────────────────────────
  const startAnalysis = useCallback(async () => {
    if (!code.trim() || isAnalyzing) return;
    setError(null);
    setResult(null);
    setLogs([]);
    setPhases({});
    setIsAnalyzing(true);

    try {
      const response = await fetch(`${API_BASE}/api/analyze/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language, filename })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to start analysis');
      }
      const { analysisId: id } = await response.json();
      setAnalysisId(id);

      const es = new EventSource(`${API_BASE}/api/analyze/${id}/stream`);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const { phase, message, report, scores, findings } = data;
        addLog(phase, message);
        if (phase === 'complete') {
          setResult({ report, scores, findings, analysisId: id });
          setIsAnalyzing(false);
          setPhaseStatus('complete', 'done');
          es.close();
        } else if (phase === 'error') {
          setError(message);
          setIsAnalyzing(false);
          es.close();
        } else {
          setPhaseStatus(phase, 'active');
          const prevIdx = ANALYSIS_PHASES.findIndex(p => p.id === phase) - 1;
          if (prevIdx >= 0) setPhaseStatus(ANALYSIS_PHASES[prevIdx].id, 'done');
        }
      };

      es.onerror = () => {
        setError('Connection lost. Please try again.');
        setIsAnalyzing(false);
        es.close();
      };
    } catch (err) {
      setError(err.message);
      setIsAnalyzing(false);
    }
  }, [code, language, filename, isAnalyzing, addLog, setPhaseStatus]);

  // ── Download PDF ───────────────────────────────────────────────────────
  const downloadPDF = useCallback(async () => {
    if (!analysisId || isDownloading) return;
    setIsDownloading(true);
    try {
      const response = await fetch(`${API_BASE}/api/analyze/${analysisId}/report`);
      if (!response.ok) throw new Error('Report not ready');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rakshak_report_${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert('PDF not ready yet. Please wait for analysis to complete.');
    } finally {
      setIsDownloading(false);
    }
  }, [analysisId, isDownloading]);

  const resetApp = useCallback(() => {
    eventSourceRef.current?.close();
    setResult(null);
    setError(null);
    setLogs([]);
    setPhases({});
    setIsAnalyzing(false);
    setAnalysisId(null);
    setActiveTab('report');
    setLoadedFiles([]);
  }, []);

  const getPhaseStatus = (phaseId) => phases[phaseId] || 'pending';

  const showHero    = !isAnalyzing && !result && !error;
  const showProgress = isAnalyzing;
  const showResults  = !!result;
  const showError    = !!error && !isAnalyzing;

  return (
    <div className="app">
      {/* ── Navbar ── */}
      <nav className="navbar">
        <div className="navbar-inner">
          <a className="logo" href="#" onClick={resetApp}>
            <div className="logo-shield">🛡️</div>
            <div className="logo-text">
              <span className="logo-name">Code Rakshak</span>
              <span className="logo-tagline">Your Code's Guardian</span>
            </div>
          </a>
          <div className="nav-badge">
            <span className="dot"></span>
            AI Analysis Engine v2.0
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      {showHero && (
        <section className="hero animate-fade-in">
          <div className="hero-badge">🛡️ AI-Powered Code Intelligence</div>
          <h1>Your Code's Guardian</h1>
          <p className="hero-sub">
            Code Rakshak scans your code for security holes, bugs, and quality issues — and explains everything in plain, simple language. Upload one file or an entire folder.
          </p>
          <div className="hero-stats">
            <div className="hero-stat"><span className="hero-stat-num">10+</span><span className="hero-stat-label">Languages</span></div>
            <div className="hero-stat"><span className="hero-stat-num">4</span><span className="hero-stat-label">AI Agents</span></div>
            <div className="hero-stat"><span className="hero-stat-num">50+</span><span className="hero-stat-label">Issue Types</span></div>
            <div className="hero-stat"><span className="hero-stat-num">PDF</span><span className="hero-stat-label">Report</span></div>
          </div>
        </section>
      )}

      {/* ── Code Input Panel ── */}
      {!showResults && !showError && (
        <section className="input-section">
          <div className="input-card">
            <div className="input-toolbar">
              <div className="toolbar-left">
                <div className="toolbar-dots">
                  <div className="dot-red"></div>
                  <div className="dot-yellow"></div>
                  <div className="dot-green"></div>
                </div>
                <span className="toolbar-title">
                  {filename}
                  {language !== 'auto' && <span className="lang-tag">{language}</span>}
                </span>
              </div>
              <div className="toolbar-right">
                <select
                  id="language-select"
                  className="lang-select"
                  value={language}
                  onChange={e => setLanguage(e.target.value)}
                  disabled={isAnalyzing}
                >
                  {LANGUAGES.map(l => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>

                {/* Single file */}
                <button id="upload-single-btn" className="btn-upload" onClick={() => singleFileRef.current?.click()} disabled={isAnalyzing}>
                  📄 File
                </button>
                <input ref={singleFileRef} type="file" style={{ display: 'none' }}
                  accept=".py,.js,.jsx,.ts,.tsx,.java,.cpp,.c,.h,.go,.rs,.php,.rb,.cs,.swift,.kt"
                  onChange={e => handleFiles(e.target.files)} />

                {/* Multiple files */}
                <button id="upload-multi-btn" className="btn-upload" onClick={() => multiFileRef.current?.click()} disabled={isAnalyzing}>
                  📂 Files
                </button>
                <input ref={multiFileRef} type="file" style={{ display: 'none' }} multiple
                  accept=".py,.js,.jsx,.ts,.tsx,.java,.cpp,.c,.h,.go,.rs,.php,.rb,.cs,.swift,.kt"
                  onChange={e => handleFiles(e.target.files)} />

                {/* Entire folder */}
                <button id="upload-folder-btn" className="btn-upload btn-upload-folder" onClick={() => folderFileRef.current?.click()} disabled={isAnalyzing}>
                  🗂️ Folder
                </button>
                <input ref={folderFileRef} type="file" style={{ display: 'none' }}
                  webkitdirectory="true" multiple
                  onChange={e => handleFiles(e.target.files)} />
              </div>
            </div>

            {/* Loaded files badge */}
            {loadedFiles.length > 0 && (
              <FileListBadge files={loadedFiles} onClear={clearFiles} />
            )}

            <div
              className="code-editor-area"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              {isDragging && (
                <div className="drop-overlay">
                  🗂️ Drop files or a folder here
                </div>
              )}
              <textarea
                id="code-input"
                className="code-textarea"
                value={code}
                onChange={e => { setCode(e.target.value); setLoadedFiles([]); }}
                placeholder={"// Paste your code here, or use the buttons above to upload a file, multiple files, or an entire folder.\n// Supported: Python, JS, TS, Java, C++, Go, Rust, PHP, Ruby, C#\n\nfunction example() {\n  const secret = 'hardcoded-api-key'; // ← Rakshak will catch this!\n}"}
                spellCheck={false}
                disabled={isAnalyzing}
              />
            </div>

            <div className="editor-footer">
              <div className="editor-stats">
                <span className="editor-stat">Lines: <span>{lineCount}</span></span>
                <span className="editor-stat">Characters: <span>{charCount}</span></span>
                <span className="editor-stat">Size: <span>{(charCount / 1024).toFixed(1)}KB</span></span>
                {loadedFiles.length > 1 && (
                  <span className="editor-stat">Files: <span>{loadedFiles.length}</span></span>
                )}
              </div>
              <button
                id="analyze-btn"
                className="btn-analyze"
                onClick={startAnalysis}
                disabled={isAnalyzing || !code.trim()}
              >
                {isAnalyzing ? (
                  <><div className="spinner"></div>Analyzing...</>
                ) : (
                  <>🛡️ Analyze Code</>
                )}
              </button>
            </div>
          </div>

          {/* Upload hint */}
          <div className="upload-hint">
            <span>📄 <strong>File</strong> — single file</span>
            <span>📂 <strong>Files</strong> — select multiple files at once</span>
            <span>🗂️ <strong>Folder</strong> — upload your entire project folder</span>
            <span>🖱️ Or <strong>drag & drop</strong> files anywhere above</span>
          </div>
        </section>
      )}

      {/* ── Progress Panel ── */}
      {showProgress && (
        <section className="progress-section">
          <div className="progress-card">
            <div className="progress-header">
              <div className="progress-shield">🛡️</div>
              <div>
                <div className="progress-title">Rakshak is Analyzing Your Code</div>
                <div className="progress-subtitle">
                  {loadedFiles.length > 1
                    ? `Analyzing ${loadedFiles.length} files — this may take 30–90 seconds...`
                    : 'Running 4 specialized AI agents — this may take 30–60 seconds...'}
                </div>
              </div>
            </div>

            <div className="progress-phases">
              {ANALYSIS_PHASES.map(phase => {
                const status = getPhaseStatus(phase.id);
                return (
                  <div key={phase.id} className={`phase-item ${status}`}>
                    <div className="phase-icon">{phase.icon}</div>
                    <div className="phase-info">
                      <div className="phase-name">{phase.name}</div>
                      <div className="phase-status">
                        {status === 'done' ? '✅ Done' : status === 'active' ? '⚡ Running...' : phase.desc}
                      </div>
                    </div>
                    {status === 'done' && <div className="phase-check">✓</div>}
                    {status === 'active' && <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }}></div>}
                  </div>
                );
              })}
            </div>

            <div className="log-feed">
              {logs.map((log, i) => (
                <div key={i} className="log-line">
                  <span className="log-phase">[{log.phase}]</span>
                  {log.message}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        </section>
      )}

      {/* ── Error State ── */}
      {showError && (
        <section className="input-section">
          <div className="error-card">
            <div className="error-icon">⚠️</div>
            <div className="error-title">Analysis Failed</div>
            <div className="error-msg">{error}</div>
            <button id="retry-btn" className="btn-retry" onClick={resetApp}>🔄 Try Again</button>
          </div>
        </section>
      )}

      {/* ── Results Dashboard ── */}
      {showResults && result && (
        <section className="results-section animate-fade-in">
          <div className="results-header">
            <div>
              <div className="results-title">
                Analysis Results — <span>{filename}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                {loadedFiles.length > 1
                  ? `${loadedFiles.length} files analyzed`
                  : `Language: ${language}`}
              </div>
            </div>
            <button id="new-analysis-btn" className="btn-new" onClick={resetApp}>
              ↩ New Analysis
            </button>
          </div>

          {/* Scores */}
          <div className="score-row">
            <ScoreCircle score={result.scores?.strengthScore ?? 0} type="strength" label="🔒 Strength Score" desc="How safe and secure your code is" />
            <ScoreCircle score={result.scores?.fairnessScore ?? 0} type="fairness" label="⚖️ Fairness Score" desc="How clean and easy to read it is" />
            <GradeCard grade={result.scores?.grade} gradeLabel={result.scores?.gradeLabel} composite={result.scores?.composite ?? 0} />
          </div>

          {/* Vulnerability counts */}
          {result.scores?.vulnerabilityCount && (
            <div className="vuln-row">
              {[
                { key: 'critical', label: '🔴 Critical', cls: 'critical', tip: 'Fix immediately' },
                { key: 'high',     label: '🟠 High',     cls: 'high',     tip: 'Fix soon' },
                { key: 'medium',   label: '🟡 Medium',   cls: 'medium',   tip: 'Fix when possible' },
                { key: 'low',      label: '🟢 Low',      cls: 'low',      tip: 'Nice to fix' },
              ].map(({ key, label, cls, tip }) => (
                <div key={key} className={`vuln-card ${cls}`}>
                  <div className="vuln-count">{result.scores.vulnerabilityCount[key] ?? 0}</div>
                  <div className="vuln-label">{label}</div>
                  <div className="vuln-tip">{tip}</div>
                </div>
              ))}
            </div>
          )}

          {/* Report Tabs */}
          <div className="report-panel">
            <div className="report-tabs">
              {[
                { id: 'report',   label: '📋 Full Report' },
                { id: 'findings', label: '🔍 Issues Found' },
                { id: 'metrics',  label: '📊 Code Stats' },
              ].map(tab => (
                <button
                  key={tab.id}
                  id={`tab-${tab.id}`}
                  className={`report-tab ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'report' && (
              <div className="report-content">
                <MarkdownRenderer content={result.report} />
              </div>
            )}

            {activeTab === 'findings' && (
              <div className="findings-list">
                {result.findings && result.findings.length > 0 ? (
                  result.findings.map((finding, i) => (
                    <div key={i} className={`finding-item ${finding.severity}`} style={{ animationDelay: `${i * 0.05}s` }}>
                      <span className="finding-badge">{finding.severity}</span>
                      <div className="finding-content">
                        <div className="finding-name">{finding.name}</div>
                        {finding.sample && <div className="finding-sample">{finding.sample}</div>}
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--low)', marginBottom: 8 }}>No Obvious Issues Found</div>
                    <div style={{ fontSize: 13 }}>Check the Full Report tab for the complete AI analysis.</div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'metrics' && result.scores?.metrics && (
              <div className="metrics-grid">
                {[
                  { label: 'Total Lines', value: result.scores.metrics.lineCount },
                  { label: 'Code Lines', value: result.scores.metrics.codeLines },
                  { label: 'Comment Lines', value: result.scores.metrics.commentLines },
                  { label: 'Functions', value: result.scores.metrics.functionCount },
                  { label: 'Classes', value: result.scores.metrics.classCount },
                  { label: 'Complexity', value: result.scores.metrics.cyclomaticComplexity },
                  { label: 'Comment Ratio', value: `${result.scores.metrics.commentRatio}%` },
                  { label: 'Strength', value: `${result.scores.strengthScore}/100` },
                  { label: 'Fairness', value: `${result.scores.fairnessScore}/100` },
                ].map((m, i) => (
                  <div key={i} className="metric-card">
                    <div className="metric-value">{m.value}</div>
                    <div className="metric-name">{m.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Download */}
          <button id="download-pdf-btn" className="btn-download" onClick={downloadPDF} disabled={isDownloading}>
            {isDownloading ? (
              <><div className="spinner" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white' }}></div>Preparing PDF...</>
            ) : (
              <>📄 Download Full PDF Report</>
            )}
          </button>
        </section>
      )}

      {/* ── Features (landing only) ── */}
      {showHero && (
        <section className="features-section">
          <div className="container">
            <h2 className="section-title">What Code Rakshak Detects</h2>
            <p className="section-sub">Powered by 4 specialized Gemini AI agents — explained in plain English</p>
            <div className="features-grid">
              {[
                { icon: '🔐', title: 'Security Vulnerabilities', desc: 'Finds passwords in your code, SQL injection holes, hacking risks, and unsafe functions' },
                { icon: '🔬', title: 'Code Structure', desc: 'Spots unused code, overly complex functions, and code that\'s hard to understand' },
                { icon: '⚖️', title: 'Code Quality', desc: 'Checks naming, formatting, documentation, and whether the code follows best practices' },
                { icon: '🕵️', title: 'Hidden Bugs', desc: 'Finds edge cases, missing checks, crashes waiting to happen, and logic errors' },
                { icon: '📊', title: 'Strength Scoring', desc: 'Gets you a 0–100 score and letter grade so you know exactly how good your code is' },
                { icon: '🗂️', title: 'Folder Upload', desc: 'Analyze an entire project folder at once — not just individual files' },
              ].map((f, i) => (
                <div key={i} className="feature-card">
                  <div className="feature-icon">{f.icon}</div>
                  <div className="feature-title">{f.title}</div>
                  <div className="feature-desc">{f.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Footer ── */}
      <footer className="footer">
        <div className="footer-logo">🛡️ Code Rakshak</div>
        <div className="footer-text">Your Code's Guardian — AI analysis made simple</div>
      </footer>
    </div>
  );
}
