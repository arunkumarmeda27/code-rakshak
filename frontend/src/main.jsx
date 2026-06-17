// ═══════════════════════════════════════════════════════════════════════════
// WATERMARK: Copyright (c) 2026 Code Rakshak by arunkumarmeda27.
// Protected under MIT License. All copies must contain this watermark.
// ═══════════════════════════════════════════════════════════════════════════

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
