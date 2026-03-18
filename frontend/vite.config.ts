import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [],
  server: {
    port: 5173,
    proxy: {
      '/chat': 'http://localhost:8000',
    },
  },
  optimizeDeps: {
    include: ['@a2ui/lit', '@a2ui/web_core'],
  },
});
