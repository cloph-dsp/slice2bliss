// Fix absolute paths to be relative
window.getRelativePath = function(path) {
  // Remove leading slash if present
  if (path.startsWith('/slice2bliss/')) {
    return '.' + path.substring('/slice2bliss'.length);
  }
  if (path.startsWith('/')) {
    return '.' + path;
  }
  return path;
};

// Patch fetch API to use relative paths
const originalFetch = window.fetch;
window.fetch = function(url, options) {
  if (typeof url === 'string') {
    url = window.getRelativePath(url);
  }
  return originalFetch.call(this, url, options);
};

console.log('Path helper initialized');
