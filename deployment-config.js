/**
 * This script will be run during the build process
 * to prepare the distribution for GitHub Pages deployment
 */
import fs from 'fs';
import path from 'path';

// Check if we're running in GitHub Actions
const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';

// Get the dist directory
const distDir = path.resolve(process.cwd(), 'dist');

// Function to update the index.html
function updateIndexHtml() {
  const indexPath = path.join(distDir, 'index.html');
  
  // Make sure the file exists
  if (!fs.existsSync(indexPath)) {
    console.error('index.html not found in dist directory');
    return;
  }
  
  let html = fs.readFileSync(indexPath, 'utf8');
  
  // Replace the script tag with a path that will work on GitHub Pages
  html = html.replace(
    /<script type="module" src="\/src\/main\.js"><\/script>/,
    '<base href="/slice2bliss/"><script src="./main-redirect.js"></script>'
  );
  
  fs.writeFileSync(indexPath, html);
  console.log('✅ Updated index.html for GitHub Pages deployment');
}

// Create the .nojekyll file to prevent Jekyll processing
function createNoJekyllFile() {
  fs.writeFileSync(path.join(distDir, '.nojekyll'), '');
  console.log('✅ Created .nojekyll file');
}

// Copy 404.html to the dist directory
function copy404Page() {
  const source404 = path.join(process.cwd(), 'public', '404.html');
  const dest404 = path.join(distDir, '404.html');
  
  if (fs.existsSync(source404)) {
    fs.copyFileSync(source404, dest404);
    console.log('✅ Copied 404.html to dist directory');
  } else {
    console.warn('⚠️ 404.html not found in public directory');
  }
}

// Copy main-redirect.js to the dist directory
function copyMainRedirect() {
  const sourceRedirect = path.join(process.cwd(), 'public', 'main-redirect.js');
  const destRedirect = path.join(distDir, 'main-redirect.js');
  
  if (fs.existsSync(sourceRedirect)) {
    fs.copyFileSync(sourceRedirect, destRedirect);
    console.log('✅ Copied main-redirect.js to dist directory');
  } else {
    console.warn('⚠️ main-redirect.js not found in public directory');
  }
}

// Run all the fixes
updateIndexHtml();
createNoJekyllFile();
copy404Page();
copyMainRedirect();

console.log('✅ GitHub Pages deployment preparation complete');
