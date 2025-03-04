/**
 * GitHub Pages module loading fix
 * This script is used to handle common MIME type issues with GitHub Pages
 */
(function() {
  // Get base path
  const baseUrl = document.querySelector('base')?.getAttribute('href') || '/';
  
  // Create a script element with proper MIME type
  const script = document.createElement('script');
  script.type = 'module';
  
  // Determine if we're on GitHub Pages
  const isGitHub = window.location.hostname.includes('github.io');
  
  // Set proper path for the entry script
  if (isGitHub) {
    script.src = `${window.location.pathname.replace(/\/+$/, '')}/assets/main.js`;
  } else {
    script.src = '/src/main.js';
  }
  
  // Error handling
  script.onerror = (e) => {
    console.error('Failed to load main script:', e);
    
    // Try fallback path
    const fallback = document.createElement('script');
    fallback.type = 'module'; 
    fallback.src = './assets/main.js';
    
    document.body.appendChild(fallback);
  };
  
  // Append the script to document
  document.body.appendChild(script);
})();
