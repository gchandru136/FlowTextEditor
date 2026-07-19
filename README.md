# emailrichtexteditor

A reusable **Email Rich Text Editor** React component, packaged for distribution
via npm. Built with React + TypeScript and bundled with Vite in library mode.

The library ships one component — `EmailRichTextEditor` — a `contenteditable`
editor rendered inside an isolated iframe, with a formatting toolbar (bold,
lists, alignment, links, tables, …) and optional AI text tools.

---

## Requirements

- **Node.js** `>= 20.19` (see `engines` in `package.json`)
- **npm** `>= 10`

## Quick start

```bash
npm install
npm run dev
```

`npm run dev` launches the playground at **http://localhost:5173** with hot reload.
Edit anything in `src/` and the preview updates instantly.

## npm scripts

| Script                     | What it does                                                      |
| -------------------------- | ----------------------------------------------------------------- |
| `npm run dev`              | Start the playground dev server (HMR).                            |
| `npm run build`            | Type-check, then build the library (`dist/`) with `.d.ts` + maps. |
| `npm run build:playground` | Build the playground as a static site (for a shareable preview).  |
| `npm run preview`          | Preview the built playground locally.                             |
| `npm run typecheck`        | Run TypeScript in no-emit mode over app + node projects.          |
| `npm run lint`             | Lint with ESLint (type-aware).                                    |
| `npm run lint:fix`         | Lint and auto-fix.                                                |
| `npm run format`           | Format the repo with Prettier.                                    |
| `npm run format:check`     | Verify formatting without writing.                                |
| `npm run clean`            | Remove `dist/`.                                                   |

## Project structure

```
.
├── src/                      # Published library source
│   ├── components/           # React components (public API lives here)
│   ├── hooks/                # Reusable hooks
│   ├── utils/                # Framework-agnostic helpers
│   ├── styles/               # Design tokens + base CSS
│   ├── types/                # Shared public types
│   ├── assets/               # Static assets bundled with the library
│   └── index.ts              # The single public entry point (barrel)
│
├── playground/               # Local demo app — NEVER published
│   ├── src/                  # Playground shell (Storybook-lite layout)
│   ├── index.html
│   └── vite.config.ts        # Dev-server config (aliases the lib to source)
│
├── vite.config.ts            # Library build (Vite library mode)
├── vite.aliases.ts           # Shared path aliases (single source of truth)
├── tsconfig*.json            # Project-reference TS setup (base/app/node)
├── eslint.config.js          # ESLint flat config (type-aware)
└── .prettierrc.json
```

## How the playground consumes the library

The playground imports the library by its **public package name**:

```ts
import { EmailRichTextEditor } from 'emailrichtexteditor';
```

During development that name is aliased to `src/index.ts` (see
`playground/vite.config.ts`), so you get **instant HMR against source** while
still importing exactly the way an external consumer would. To smoke-test the
real built artifact instead, run `npm run build` and remove the package-name
alias.

## Path aliases

Defined once in `vite.aliases.ts` and mirrored in `tsconfig.app.json`:

| Alias           | Resolves to        |
| --------------- | ------------------ |
| `@/*`           | `src/*`            |
| `@components/*` | `src/components/*` |
| `@hooks/*`      | `src/hooks/*`      |
| `@utils/*`      | `src/utils/*`      |
| `@styles/*`     | `src/styles/*`     |
| `@assets/*`     | `src/assets/*`     |

## Package exports

Configured in `package.json` for modern, dual-format consumption:

```jsonc
{
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js", // ESM
    "require": "./dist/index.cjs", // CJS
  },
  "./styles.css": "./dist/emailrichtexteditor.css",
}
```

- **Tree-shaking** — `"sideEffects": ["**/*.css"]` lets bundlers drop unused code
  while preserving stylesheet imports.
- **Peer dependencies** — `react` / `react-dom` are peers (`^18 || ^19`); they are
  never bundled into `dist`.

## Usage

```tsx
import { useState } from 'react';
import { EmailRichTextEditor } from 'emailrichtexteditor';
import type { AiTextActionHandler } from 'emailrichtexteditor';
import 'emailrichtexteditor/styles.css';

// The component is backend-agnostic: you wire the AI transport here.
const handleAiText: AiTextActionHandler = async ({ action, text, wordCount, toneType }) => {
  const res = await fetch('/api/ai-text-tools', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, text, wordCount, toneType }),
  });
  const data = await res.json();
  return data.response ?? null;
};

export function Composer() {
  const [content, setContent] = useState('<p>Hello!</p>');
  return (
    <EmailRichTextEditor
      mailContent={content}
      setMailContent={setContent}
      onAiTextAction={handleAiText}
    />
  );
}
```

### Props

| Prop                    | Type                        | Default   | Description                                                     |
| ----------------------- | --------------------------- | --------- | --------------------------------------------------------------- |
| `mailContent`           | `string`                    | —         | **Required.** Current HTML content (controlled).                |
| `setMailContent`        | `(content: string) => void` | —         | **Required.** Called with the editor's HTML on every edit.      |
| `showAiTools`           | `boolean`                   | `true`    | Show the AI toolbar. Requires `onAiTextAction`.                 |
| `onAiTextAction`        | `AiTextActionHandler`       | —         | Handler powering the AI buttons. Omit to disable AI features.   |
| `resetMailContent`      | `boolean`                   | `false`   | Toggle to force the editor to re-sync `mailContent`.            |
| `selectedProduct`       | `string \| number`          | —         | Optional external key; changing it re-syncs content.            |
| `spellcheckIgnoreWords` | `string[]`                  | `[]`      | Words wrapped in `spellcheck="false"` spans (e.g. brand names). |
| `modalHeight`           | `string`                    | `'650px'` | Height of the editor iframe (any CSS length).                   |

> **Styles:** import `emailrichtexteditor/styles.css` once in your app. The
> toolbar/editor inside the iframe are self-styled; the stylesheet themes the
> loading spinner and error toast (and exposes `--erte-*` design tokens).

### Decoupling from the original component

The source component was adapted for reuse — behavior is unchanged, but
app-specific coupling was removed so the package stands alone:

- **AI backend** → injected via `onAiTextAction` (was a hard-coded `axios` call
  to a `NEXT_PUBLIC_SERVER_API` endpoint).
- **`selectedProduct`** → now an optional prop (was read from Redux).
- **Spellcheck exceptions** → now the `spellcheckIgnoreWords` prop (were
  hard-coded product names).
- **Loader / toast** → small internal components (were app-local imports).
- **Icons** → inlined as SVG strings (Font Awesome 5 Free, MIT). The package has
  **zero runtime dependencies** — only the `react` / `react-dom` peers.

## Publishing (later)

Everything is prepared; when you're ready:

```bash
npm run build      # prepublishOnly also runs this automatically
npm publish
```

## License

MIT — see [LICENSE](./LICENSE).
