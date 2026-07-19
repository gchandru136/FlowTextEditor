/**
 * Public API surface of `flowtext-editor`.
 *
 * Everything a consumer can import lives behind these barrels. Keeping the
 * surface explicit here (rather than deep-importing files) lets us refactor
 * internals freely without breaking consumers.
 */

// Ships the library's design tokens / base styles into `dist/*.css`,
// exposed to consumers via the `./styles.css` package export.
import './styles/index.css';

export * from './components';
export * from './hooks';
export * from './utils';
export * from './types';
