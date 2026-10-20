import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// No StrictMode: the app owns a single long-lived Web Worker, and the double-mount in
// development would otherwise reset the simulation twice.
createRoot(document.getElementById('root')!).render(<App />);
