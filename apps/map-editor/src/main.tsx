import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles.css';

// No StrictMode: it double-mounts effects, which would create and destroy the Phaser game twice.
createRoot(document.getElementById('root')!).render(<App />);
