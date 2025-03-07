/**
 * Enhanced deployment configuration for GitHub Pages
 * Handles build optimization and asset preparation
 */
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
const distDir = path.resolve(process.cwd(), 'dist');

// Calculate hash for cache busting
function calculateHash(content) {
  return createHash('md5').update(content).digest('hex').slice(0, 8);
}

// Enhanced HTML processing
async function processHtml() {
  const indexPath = path.join(distDir, 'index.html');
  
  if (!fs.existsSync(indexPath)) {
    console.error('❌ index.html not found in dist directory');
    process.exit(1);
  }
  
  let html = fs.readFileSync(indexPath, 'utf8');
  
  // Update script tags with integrity hashes
  const mainJsPath = path.join(distDir, 'assets/main.js');
  if (fs.existsSync(mainJsPath)) {
    const mainJsContent = fs.readFileSync(mainJsPath);
    const hash = calculateHash(mainJsContent);
    html = html.replace(
      /<script type="module" src="\/src\/main\.js"><\/script>/,
      `<script type="module" src="/slice2bliss/assets/main.js?v=${hash}" crossorigin="anonymous"></script>`
    );
  }
  
  fs.writeFileSync(indexPath, html);
  console.log('✅ Enhanced index.html with optimizations');
}

// Set up static files
function setupStaticFiles() {
  // Create .nojekyll
  fs.writeFileSync(path.join(distDir, '.nojekyll'), '');
  console.log('✅ Created .nojekyll file');

  // Copy and enhance 404 page
  const source404 = path.join(process.cwd(), 'public', '404.html');
  const dest404 = path.join(distDir, '404.html');
  
  if (fs.existsSync(source404)) {
    let content = fs.readFileSync(source404, 'utf8');
    content = content.replace('<head>', `<head>
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
    <script>sessionStorage.redirect = location.href;</script>`);
    fs.writeFileSync(dest404, content);
    console.log('✅ Enhanced 404.html with redirect support');
  }

  // Create robots.txt
  fs.writeFileSync(path.join(distDir, 'robots.txt'), 
    'User-agent: *\nAllow: /\nDisallow: /assets/\n');
  console.log('✅ Created robots.txt');
}

// Print build info
function printBuildInfo() {
  const buildInfo = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    isGitHubPages: isGitHubActions,
  };
  
  fs.writeFileSync(
    path.join(distDir, 'build-info.json'),
    JSON.stringify(buildInfo, null, 2)
  );
  console.log('✅ Created build-info.json');
}

// Run optimizations
async function run() {
  try {
    await processHtml();
    setupStaticFiles();
    printBuildInfo();
    console.log('✅ GitHub Pages deployment preparation complete');
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

run();
