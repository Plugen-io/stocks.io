import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // chamadas /api/* da UI vão pro agent local
      '/api': {
        target: 'http://127.0.0.1:7700',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
