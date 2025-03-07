/**
 * Essential GitHub Pages deployment configuration
 */
import fs from 'fs';
import path from 'path';

const distDir = path.resolve(process.cwd(), 'dist');

try {
  // Create .nojekyll file
  fs.writeFileSync(path.join(distDir, '.nojekyll'), '');
  console.log('✅ Created .nojekyll file');

  // Copy 404.html for SPA routing
  const source404 = path.join(process.cwd(), 'public', '404.html');
  const dest404 = path.join(distDir, '404.html');
  if (fs.existsSync(source404)) {
    fs.copyFileSync(source404, dest404);
    console.log('✅ Copied 404.html');
  }

  console.log('✅ GitHub Pages preparation complete');
} catch (error) {
  console.error('❌ Deployment preparation failed:', error);
  process.exit(1);
}
