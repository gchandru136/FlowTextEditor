import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { aliases } from '../vite.aliases';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const playgroundRoot = fileURLToPath(new URL('.', import.meta.url));

/**
 * Playground / demo dev server (`npm run dev`).
 *
 * This app is NEVER published. It imports the library by its public package
 * name — exactly like an external consumer would — but the name is aliased to
 * the library *source* so edits hot-reload instantly (no rebuild step).
 *
 * To smoke-test against the real built output instead, run `npm run build`
 * and remove the package-name alias below.
 */
export default defineConfig({
  root: playgroundRoot,
  plugins: [react()],
  resolve: {
    alias: [
      {
        // Anchored so only the bare specifier maps to source; subpaths are untouched.
        find: /^emailrichtexteditor$/,
        replacement: fileURLToPath(new URL('../src/index.ts', import.meta.url)),
      },
      ...aliases,
    ],
  },
  server: {
    port: 5173,
    open: true,
    // Allow serving the library source that lives above the playground root.
    fs: { allow: [repoRoot] },
  },
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
  },
});
