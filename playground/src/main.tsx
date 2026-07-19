import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './playground.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Playground root element (#root) was not found.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
