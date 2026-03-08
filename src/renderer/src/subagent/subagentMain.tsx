/**
 * Sub-agent Widget Entry Point
 *
 * Entry point for sub-agent widgets using the new 3-layer architecture:
 * - Data Layer: Polling-based data from TranscriptWatcher (claude-esp style)
 * - Business Logic: useSubagentState, useSubagentMessages
 * - View Layer: SubagentWidget components
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import SubagentWidget from './SubagentWidget';
import '../widget.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SubagentWidget />
  </React.StrictMode>
);
