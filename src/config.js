/**
 * Configuration settings for different environments
 */
const isGitHubPages = window.location.hostname.includes('github.io');

// Base path is different on GitHub Pages (includes repository name)
export const BASE_PATH = isGitHubPages ? '/slice2bliss/' : '/';

// Helper function to create correct paths for assets
export function getAssetPath(path) {
    // Remove leading slash if present to avoid double slashes
    const cleanPath = path.startsWith('/') ? path.substring(1) : path;
    return `${BASE_PATH}${cleanPath}`;
}

// Other configuration settings can go here
export const config = {
    isProduction: isGitHubPages || window.location.hostname !== 'localhost',
    // Add other configuration properties as needed
};
