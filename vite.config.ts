import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check if we're building for GitHub Pages
const isGitHubPages = process.env.GITHUB_PAGES === 'true';
// Use the repository name as the base path for GitHub Pages
const base = isGitHubPages ? '/slice2bliss/' : '/';

export default defineConfig({
  root: resolve(__dirname),
  plugins: [react()],
  base, // Set the base path correctly
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  css: {
    devSourcemap: true,
    postcss: './postcss.config.cjs'
  },
  server: {
    hmr: {
      overlay: true
    }
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    assetsDir: 'assets',
    emptyOutDir: true,
    // Add public copy
    copyPublicDir: true,
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name].[hash].[ext]',
        chunkFileNames: 'assets/[name].[hash].js',
        entryFileNames: 'assets/[name].[hash].js',
      }
    }
  }
});
