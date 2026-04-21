import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // jsdom 28 → html-encoding-sniffer 6 → @exodus/bytes/encoding-lite.js (pure ESM)
      // Redirect to a CJS-compatible shim so the test worker can boot under Node 20 CJS mode.
      '@exodus/bytes/encoding-lite.js': path.resolve(
        __dirname,
        'src/__test-shims__/exodus-bytes-encoding-lite.cjs',
      ),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.ts',
    exclude: [...configDefaults.exclude, 'e2e/**', 'playwright.config.ts'],
  },
});
