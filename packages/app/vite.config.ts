import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@cardledger/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  server: { port: 3000 },
});
