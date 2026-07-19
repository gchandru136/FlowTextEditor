import { useState } from 'react';
// Imported by the library's PUBLIC package name — exactly how an external
// consumer would. In dev this resolves to `src/` for instant HMR.
import { cx, FlowTextEditor } from 'flowtext-editor';
import type { AiTextActionHandler } from 'flowtext-editor';
// Default preview document — an exported email template loaded as raw HTML.
// Swap this file (or the import) to preview any other content.
import sampleEmail from './sample-email.html?raw';

type Theme = 'light' | 'dark';

const SAMPLE_CONTENT = sampleEmail;

/**
 * Mock AI handler so the AI toolbar works in the playground without a backend.
 * In a real app this would call your own API and resolve with the new text.
 */
const mockAiHandler: AiTextActionHandler = async ({ action, text, toneType }) => {
  await new Promise<void>((resolve) => setTimeout(resolve, 500));
  switch (action) {
    case 'enhance':
      return `${text} ✨`;
    case 'proofread':
      return text.replace(/\s+/g, ' ').trim();
    case 'expand':
      return `${text} ${text}`;
    case 'shorten': {
      const words = text.split(/\s+/);
      return words.slice(0, Math.ceil(words.length / 2)).join(' ');
    }
    case 'changeTone':
      return toneType === 'friendly' ? `Hey! ${text} 😊` : `Dear recipient, ${text}`;
    default:
      return text;
  }
};

/**
 * Local playground shell (never published). Provides a Storybook-lite layout:
 * a component canvas in the center and a live controls panel on the right.
 */
export function App() {
  const [theme, setTheme] = useState<Theme>('light');
  const [mailContent, setMailContent] = useState<string>(SAMPLE_CONTENT);
  const showAiTools = false;

  const toggleTheme = () => setTheme((current) => (current === 'light' ? 'dark' : 'light'));

  return (
    <div className={cx('playground')} data-theme={theme}>
      <header className="pg-header">
        <div className="pg-brand">
          <span className="pg-logo" aria-hidden>
            ✉️
          </span>
          <div>
            <h1 className="pg-title">Flow Text Editor</h1>
            <p className="pg-subtitle">Development playground</p>
          </div>
        </div>
        <div className="pg-header-actions">
          {/* <span className="pg-badge">dev</span> */}
          <button type="button" className="pg-btn" onClick={toggleTheme}>
            {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
          </button>
        </div>
      </header>

      <div className="pg-body">
        <main className="pg-canvas">
          <div className="pg-canvas-inner">
            <div className="pg-stage">
              <FlowTextEditor
                mailContent={mailContent}
                setMailContent={setMailContent}
                showAiTools={showAiTools}
                onAiTextAction={mockAiHandler}
                modalHeight="460px"
              />
            </div>
          </div>
        </main>

        <aside className="pg-controls">
          <p className="pg-section-label">Controls</p>

          {/* <label className="pg-control">
            <span className="pg-control-label">showAiTools</span>
            <input
              type="checkbox"
              checked={showAiTools}
              onChange={(event) => setShowAiTools(event.target.checked)}
            />
          </label> */}

          <label className="pg-control pg-control--column">
            <span className="pg-control-label">Content (HTML)</span>
            <textarea
              className="pg-textarea"
              rows={20}
              value={mailContent}
              onChange={(event) => setMailContent(event.target.value)}
              spellCheck={false}
            />
          </label>

          {/* <p className="pg-hint">
            AI buttons use a mock handler (<code>mockAiHandler</code>). Select text in the editor
            and click an AI action to see it transform.
          </p> */}
        </aside>
      </div>
    </div>
  );
}
