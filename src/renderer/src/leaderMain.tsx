/**
 * Leader Widget Entry Point
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import LeaderWidget from './LeaderWidget';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LeaderWidget />
  </React.StrictMode>
);
