import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Get the directory path equivalent to __dirname in ESM
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  // Let PostCSS config handle this instead
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
});
