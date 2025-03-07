/**
 * GitHub Pages module loading fix
 * This script ensures the main bundle is loaded correctly on GitHub Pages
 */
(function() {
  const script = document.createElement('script');
  script.type = 'module';
  script.src = '/slice2bliss/assets/main.js';
  
  script.onerror = (e) => {
    console.error('Failed to load main script:', e);
  };
  
  document.body.appendChild(script);
})();
