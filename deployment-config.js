/**
 * Simple deployment configuration for GitHub Pages
 */
import fs from 'fs';
import path from 'path';

const distDir = path.resolve(process.cwd(), 'dist');

// Copy necessary files for GitHub Pages
function setupGitHubPages() {
  // Create .nojekyll
  fs.writeFileSync(path.join(distDir, '.nojekyll'), '');
  console.log('✅ Created .nojekyll file');

  // Copy 404.html
  const source404 = path.join(process.cwd(), 'public', '404.html');
  const dest404 = path.join(distDir, '404.html');
  if (fs.existsSync(source404)) {
    fs.copyFileSync(source404, dest404);
    console.log('✅ Copied 404.html');
  }

  // Create basic _headers file
  const headers = `/*
  Cache-Control: public, max-age=31536000
/index.html
  Cache-Control: no-cache
`;
  fs.writeFileSync(path.join(distDir, '_headers'), headers);
  console.log('✅ Created _headers file');
}

try {
  setupGitHubPages();
  console.log('✅ GitHub Pages deployment preparation complete');
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
}
