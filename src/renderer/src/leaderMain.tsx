/**
 * Leader Widget Entry Point
 *
 * Entry point for leader (parent agent) widgets using the 3-layer architecture:
 * - Data Layer: Stream-based data from ClaudeAgentService SDK
 * - Business Logic: useLeaderState, useLeaderMessages, useSubagentTracking
 * - View Layer: LeaderWidget components
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import LeaderWidget from './leader/LeaderWidget';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LeaderWidget />
  </React.StrictMode>
);
