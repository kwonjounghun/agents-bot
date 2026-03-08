import ReactDOM from 'react-dom/client';
import SubagentWidget from './subagent/SubagentWidget';
import './widget.css';

// Note: StrictMode removed to prevent double-mount issues with IPC subscriptions
ReactDOM.createRoot(document.getElementById('root')!).render(<SubagentWidget />);
