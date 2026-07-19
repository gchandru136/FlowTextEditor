import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import { aliases } from './vite.aliases';

/**
 * Library build configuration (`npm run build`).
 *
 * Emits tree-shakeable ESM + CJS bundles, source maps, and a single bundled
 * type-declaration entry (`dist/index.d.ts`). React is externalized so it is
 * never bundled into the package — consumers provide it as a peer dependency.
 */
export default defineConfig({
  plugins: [
    react(),
    dts({
      // Use the browser tsconfig so path aliases resolve during .d.ts emit.
      tsconfigPath: './tsconfig.app.json',
      include: ['src'],
      exclude: ['src/**/*.test.*', 'src/**/*.stories.*', 'src/**/*.spec.*'],
      // Bundle every declaration into one clean `index.d.ts` (resolves aliases).
      rollupTypes: true,
      insertTypesEntry: true,
    }),
  ],
  resolve: {
    alias: aliases,
  },
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
      // Single stylesheet, referenced by the package `./styles.css` export.
      cssFileName: 'emailrichtexteditor',
    },
    sourcemap: false,
    rollupOptions: {
      // Externalize the React peers and their subpaths (react/jsx-runtime,
      // react-dom/client, ...) so they are never bundled.
      external: [/^react($|\/)/, /^react-dom($|\/)/],
    },
    // Keep the published bundle readable; consumers minify in their own build.
    minify: false,
    target: 'es2020',
  },
});
