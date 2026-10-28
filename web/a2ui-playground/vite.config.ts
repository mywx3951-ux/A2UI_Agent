import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@a2ui/core': fileURLToPath(new URL('../../packages/a2ui-core/src', import.meta.url)),
      '@a2ui/react': fileURLToPath(new URL('../../packages/a2ui-react/src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
});
