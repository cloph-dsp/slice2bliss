import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/slice2bliss/',
  root: '.',
  build: {
    outDir: 'dist',
  },
});
