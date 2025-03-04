import { getAssetPath, config } from './config.js';

// Add a helper function to get proper relative URLs
function getRelativePath(path) {
  // Remove leading slash if present
  if (path.startsWith('/slice2bliss/')) {
    return '.' + path.substring('/slice2bliss'.length);
  }
  if (path.startsWith('/')) {
    return '.' + path;
  }
  return path;
}

// Wrap initialization code in a DOMContentLoaded event to ensure DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Initialize your application here
    initApp();
});

function initApp() {
    console.log('Application initialized');
    
    // Use the getAssetPath helper for any dynamic resource loading
    loadResources();
    
    // Add error handlers for query operations
    setupErrorHandling();
}

function loadResources() {
    // Example of loading resources with proper path handling
    try {
        // Use getAssetPath for any dynamically loaded resources
        const resourcePath = getRelativePath('/slice2bliss/assets/data.json');
        console.log(`Loading resource from: ${resourcePath}`);
        
        // Example fetch with error handling
        fetch(resourcePath)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error ${response.status}`);
                }
                return response.json();
            })
            .then(data => console.log('Resource loaded successfully'))
            .catch(error => console.error('Error loading resource:', error));
    } catch (error) {
        console.error('Error in resource loading:', error);
    }
}

function setupErrorHandling() {
    // Add global error handler for query operations
    const originalQuerySelector = document.querySelector;
    
    // Wrap query methods with error handling
    try {
        // Safe query selector with error handling
        window.safeQuery = function(selector) {
            try {
                return document.querySelector(selector);
            } catch (error) {
                console.error(`Error querying for '${selector}':`, error);
                return null;
            }
        };
    } catch (error) {
        console.error('Error setting up error handlers:', error);
    }
}
