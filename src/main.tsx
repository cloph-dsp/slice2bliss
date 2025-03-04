import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css'; // Make sure this path is correct

// Log for debugging
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
