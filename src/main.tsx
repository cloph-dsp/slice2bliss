import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Import styles
import './index.css';
import './styles/grid.css';
import './styles/responsive.css';
import './styles/animations.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
