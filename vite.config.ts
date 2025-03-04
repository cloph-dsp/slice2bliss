import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'path';

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
    plugins: [react()],
    base: base, // Set the correct base path
    resolve: {
      alias: {
        '@': resolve(__dirname, './src')
      }
    },
    css: {
      devSourcemap: true,
      postcss: './postcss.config.cjs'
    },
    server: {
      hmr: {
        overlay: true
      },
      // No headers that could cause issues
    },
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
    build: {
      outDir: resolve(__dirname, 'dist'),
      assetsDir: 'assets',
      emptyOutDir: true,
      copyPublicDir: true,
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: isGitHubPages, // Remove console logs in GitHub Pages build
        },
      },
      // Add source maps for easier debugging
      sourcemap: !isGitHubPages,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
            vendor: ['lucide-react'],
          },
          entryFileNames: 'assets/[name].[hash].js',
          chunkFileNames: 'assets/[name].[hash].js',
          assetFileNames: 'assets/[name].[hash].[ext]',
        }
      }
    }
  };
});
