import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'path';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig(({ mode }) => {
  // Load env variables
  process.env = { ...process.env, ...loadEnv(mode, process.cwd()) };
  
  // Check if we're building for GitHub Pages
  const isGitHubPages = process.env.GITHUB_PAGES === 'true';
  const base = isGitHubPages ? '/slice2bliss/' : '/';
  
  console.log(`Building for ${isGitHubPages ? 'GitHub Pages' : 'local/production'} with base: "${base}"`);
  
  return {
    root: resolve(__dirname),
    plugins: [
      react(),
      nodePolyfills({
        include: ['crypto']
      })
    ],
    base, // Set the correct base path
    resolve: {
      alias: {
        '@': resolve(__dirname, './src')
      },
      // IMPORTANT: Add extensions to ensure Vite can resolve modules properly
      extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json']
    },
    css: {
      devSourcemap: true,
      postcss: './postcss.config.cjs'
    },
    server: {
      hmr: {
        overlay: true
      },
    },
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
    build: {
      outDir: resolve(__dirname, 'dist'),
      emptyOutDir: true,
      assetsDir: 'assets',
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html')
        }
      }
    }
  };
});
