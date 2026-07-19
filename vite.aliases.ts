import { fileURLToPath } from 'node:url';
import type { Alias } from 'vite';

/**
 * Resolve a path relative to the repository root (this file lives at the root).
 * Using `import.meta.url` keeps resolution correct no matter which Vite config
 * (library build or playground) imports these aliases.
 */
const fromRoot = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

/**
 * Single source of truth for path aliases. Mirrored in `tsconfig.app.json`.
 * Listed most-specific first so the generic `@` never shadows the others.
 */
export const aliases: Alias[] = [
  { find: '@components', replacement: fromRoot('./src/components') },
  { find: '@hooks', replacement: fromRoot('./src/hooks') },
  { find: '@utils', replacement: fromRoot('./src/utils') },
  { find: '@styles', replacement: fromRoot('./src/styles') },
  { find: '@assets', replacement: fromRoot('./src/assets') },
  { find: '@', replacement: fromRoot('./src') },
];
