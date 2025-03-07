import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Import styles
import './index.css';

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
