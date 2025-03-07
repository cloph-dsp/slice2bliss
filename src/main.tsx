import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Import all styles
import './index.css';
import '../styles/main.css';
import './styles/animations.css';
import './styles/grid.css';
import './styles/responsive.css';

// Debug logging
console.log('Main module loaded successfully. Running in:', 
  import.meta.env.MODE, 
  'Base URL:', import.meta.env.BASE_URL);

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('Root element not found!');
} else {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
