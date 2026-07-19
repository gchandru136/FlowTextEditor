import type { RichTextValue } from '@/types';

/** AI text operations the editor's toolbar can request. */
export type AiTextAction = 'enhance' | 'proofread' | 'expand' | 'shorten' | 'changeTone';

/** Tone presets used by the `changeTone` action. */
export type AiToneType = 'friendly' | 'formal';

/** Payload passed to the host-provided AI handler. */
export interface AiTextActionPayload {
  /** Which operation to run. */
  action: AiTextAction;
  /** The currently selected text to transform. */
  text: string;
  /** Suggested target word count (used by `expand` / `shorten`), else `null`. */
  wordCount: number | null;
  /** Target tone (used by `changeTone`), else `null`. */
  toneType: AiToneType | null;
}

/**
 * Host-supplied handler that performs the AI transformation and resolves with
 * the replacement text (or `null` to leave the selection unchanged).
 *
 * This is how the library stays backend-agnostic: the consumer wires their own
 * API/transport here instead of the component hard-coding a request.
 */
export type AiTextActionHandler = (payload: AiTextActionPayload) => Promise<string | null>;

export interface EmailRichTextEditorProps {
  /** Current HTML content of the editor (controlled). */
  mailContent: RichTextValue;
  /** Called with the editor's HTML whenever the user edits it. */
  setMailContent: (content: RichTextValue) => void;
  /** Toggle to force the editor to re-sync `mailContent` (e.g. on reset). */
  resetMailContent?: boolean;
  /** Show the AI toolbar (Enhance, Proofread, …). Requires `onAiTextAction`. */
  showAiTools?: boolean;
  /** Height of the editor iframe (any CSS length). Defaults to `650px`. */
  modalHeight?: string;
  /** Words wrapped in `spellcheck="false"` spans (e.g. product/brand names). */
  spellcheckIgnoreWords?: string[];
  /** Handler invoked by the AI toolbar buttons. Omit to disable AI features. */
  onAiTextAction?: AiTextActionHandler;
}
