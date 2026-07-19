import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { escapeRegExp } from '@/utils';
import { ErrorToaster, SpinnerLoader } from '@/components/internal';
import { getTableHtml } from './getTableHtml';
import { icons } from './icons';
import { parseCssColor, rgbToHex } from './color';
import { openColorPicker } from './colorPicker';
import { openLinkPopover } from './linkPopover';
import { initTableTools } from './tableTools';
import type { AiTextAction, AiToneType, FlowTextEditorProps } from './types';

/** Wrap each ignored word in a non-spellchecked span (pure, module-level). */
const applySpellcheckIgnore = (content: string, words: readonly string[]): string =>
  words.reduce(
    (html, word) =>
      html.replace(new RegExp(escapeRegExp(word), 'g'), `<span spellcheck="false">${word}</span>`),
    content,
  );

/** Commands whose on/off state we reflect as an active toolbar button. */
const TOGGLE_COMMANDS = new Set<string>([
  'bold',
  'italic',
  'underline',
  'strikeThrough',
  'subscript',
  'superscript',
  'justifyLeft',
  'justifyCenter',
  'justifyRight',
  'justifyFull',
  'insertUnorderedList',
  'insertOrderedList',
]);

interface ToggleButton {
  el: HTMLButtonElement;
  cmd: string;
}

interface BlockOption {
  label: string;
  tag: string;
  optionClass: string;
}

/**
 * Block-level format options for the paragraph-style dropdown. Styles only —
 * Block Quote and Code Block are dedicated toolbar buttons (their pseudo tags
 * 'blockquote' / 'codeblock' are still handled by `applyBlockFormat`).
 */
const BLOCK_OPTIONS: BlockOption[] = [
  { label: 'Paragraph', tag: 'p', optionClass: '' },
  { label: 'Heading 1', tag: 'h1', optionClass: 'erte-option--h1' },
  { label: 'Heading 2', tag: 'h2', optionClass: 'erte-option--h2' },
  { label: 'Heading 3', tag: 'h3', optionClass: 'erte-option--h3' },
  { label: 'Heading 4', tag: 'h4', optionClass: 'erte-option--h4' },
  { label: 'Heading 5', tag: 'h5', optionClass: 'erte-option--h5' },
  { label: 'Heading 6', tag: 'h6', optionClass: 'erte-option--h6' },
  { label: 'Preformatted', tag: 'pre', optionClass: 'erte-option--pre' },
];

interface AlignOption {
  key: string;
  label: string;
  cmd: string;
  iconKey: 'alignLeft' | 'alignCenter' | 'alignRight' | 'alignJustify';
}

/** Alignment choices grouped into a single dropdown (trigger shows the active one). */
const ALIGN_OPTIONS: AlignOption[] = [
  { key: 'left', label: 'Left', cmd: 'justifyLeft', iconKey: 'alignLeft' },
  { key: 'center', label: 'Center', cmd: 'justifyCenter', iconKey: 'alignCenter' },
  { key: 'right', label: 'Right', cmd: 'justifyRight', iconKey: 'alignRight' },
  { key: 'justify', label: 'Justify', cmd: 'justifyFull', iconKey: 'alignJustify' },
];

interface ListStyleOption {
  key: string;
  label: string;
  /** Marker glyphs for the three preview rows in the style-picker tile. */
  markers: [string, string, string];
  /**
   * Inline `list-style-type` value applied to the list element (email-export
   * friendly). `null` = handled via a `data-erte-list` attribute + editor CSS
   * (only "legal", which has no native list-style-type).
   */
  css: string | null;
}

/** Numbered-list marker styles (split-button dropdown). */
const ORDERED_LIST_STYLES: ListStyleOption[] = [
  { key: 'decimal', label: 'Decimal', markers: ['1.', '2.', '3.'], css: 'decimal' },
  { key: 'lower-alpha', label: 'Lower alpha', markers: ['a.', 'b.', 'c.'], css: 'lower-alpha' },
  { key: 'upper-alpha', label: 'Upper alpha', markers: ['A.', 'B.', 'C.'], css: 'upper-alpha' },
  { key: 'lower-roman', label: 'Lower roman', markers: ['i.', 'ii.', 'iii.'], css: 'lower-roman' },
  { key: 'upper-roman', label: 'Upper roman', markers: ['I.', 'II.', 'III.'], css: 'upper-roman' },
  {
    key: 'leading-zero',
    label: 'Leading zero',
    markers: ['01.', '02.', '03.'],
    css: 'decimal-leading-zero',
  },
  { key: 'legal', label: 'Legal (nested 1.1)', markers: ['1.1', '1.2', '1.3'], css: null },
];

/** Bullet-list marker styles. String values use CSS string list markers. */
const BULLET_LIST_STYLES: ListStyleOption[] = [
  { key: 'disc', label: 'Solid circle', markers: ['●', '●', '●'], css: 'disc' },
  { key: 'circle', label: 'Hollow circle', markers: ['○', '○', '○'], css: 'circle' },
  { key: 'square', label: 'Square', markers: ['▪', '▪', '▪'], css: 'square' },
  { key: 'diamond', label: 'Diamond', markers: ['◆', '◆', '◆'], css: '"◆  "' },
  { key: 'dash', label: 'Dash', markers: ['–', '–', '–'], css: '"–  "' },
  { key: 'arrow', label: 'Arrow', markers: ['➤', '➤', '➤'], css: '"➤  "' },
  { key: 'check', label: 'Checkmark', markers: ['✓', '✓', '✓'], css: '"✓  "' },
];

/** Inline styles for the semantic Block Quote (email-export friendly). */
const QUOTE_INLINE_STYLE: Partial<CSSStyleDeclaration> = {
  margin: '12px 0',
  padding: '2px 0 2px 14px',
  borderLeft: '3px solid #d5dbe2',
  color: '#5f6368',
};

/** Inline styles for the Code Block `<pre data-erte-code>` (email-export friendly). */
const CODE_BLOCK_INLINE_STYLE: Partial<CSSStyleDeclaration> = {
  background: '#f6f8fa',
  border: '1px solid #e8ebee',
  borderRadius: '8px',
  padding: '12px 14px',
  margin: '12px 0',
  fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
  fontSize: '13px',
  lineHeight: '1.55',
  whiteSpace: 'pre-wrap',
  overflowX: 'auto',
};

/** Inline styles applied to inserted horizontal rules. */
const HR_INLINE_STYLE: Partial<CSSStyleDeclaration> = {
  border: 'none',
  borderTop: '1px solid #d5dbe2',
  margin: '18px 0',
};

/** Selectable font sizes (px) for the font-size dropdown. */
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 32, 36, 48, 64, 72];
const DEFAULT_FONT_SIZE = 16;
const MIN_FONT_SIZE = 1;
const MAX_FONT_SIZE = 200;

/** The editor's default text colour (matches `--erte-text`). */
const DEFAULT_TEXT_COLOR = '#1a1a1a';

type ColorKind = 'text' | 'bg';

interface PaletteColor {
  hex: string;
  name: string;
}

/** Preset swatches for the colour dropdowns (6 columns × 5 rows). */
const COLOR_PALETTE: PaletteColor[] = [
  { hex: '#bfedd2', name: 'Light green' },
  { hex: '#fbeeb8', name: 'Light yellow' },
  { hex: '#f8cac6', name: 'Light red' },
  { hex: '#eccafa', name: 'Light purple' },
  { hex: '#c2e0f4', name: 'Light blue' },
  { hex: '#b2ebf2', name: 'Light cyan' },
  { hex: '#2dc26b', name: 'Green' },
  { hex: '#f1c40f', name: 'Yellow' },
  { hex: '#e03e2d', name: 'Red' },
  { hex: '#b96ad9', name: 'Purple' },
  { hex: '#3598db', name: 'Blue' },
  { hex: '#00bcd4', name: 'Cyan' },
  { hex: '#169179', name: 'Dark turquoise' },
  { hex: '#e67e23', name: 'Orange' },
  { hex: '#ba372a', name: 'Dark red' },
  { hex: '#843fa1', name: 'Dark purple' },
  { hex: '#236fa1', name: 'Dark blue' },
  { hex: '#e91e63', name: 'Pink' },
  { hex: '#ecf0f1', name: 'Light gray' },
  { hex: '#ced4d9', name: 'Medium gray' },
  { hex: '#95a5a6', name: 'Gray' },
  { hex: '#7e8c8d', name: 'Dark gray' },
  { hex: '#34495e', name: 'Navy blue' },
  { hex: '#795548', name: 'Brown' },
  { hex: '#000000', name: 'Black' },
  { hex: '#434343', name: 'Dark charcoal' },
  { hex: '#666666', name: 'Dim gray' },
  { hex: '#b7b7b7', name: 'Silver' },
  { hex: '#f3f3f3', name: 'Off white' },
  { hex: '#ffffff', name: 'White' },
];

/** Resize constraints for the editor container (width max is the parent = 100%). */
const MIN_EDITOR_WIDTH = 600;
const MIN_EDITOR_HEIGHT = 350;
const MAX_EDITOR_HEIGHT = 1200;

/** Which edges a drag adjusts; left/top drags grow the box with inverted deltas. */
interface ResizeEdges {
  h: 'left' | 'right' | null;
  v: 'top' | 'bottom' | null;
}

interface ResizeZone {
  key: string;
  label: string;
  cursor: string;
  edges: ResizeEdges;
  placement: CSSProperties;
}

/**
 * Invisible resize hit areas (native window-style): right edge + the two
 * bottom corners only. Top and left borders (and top corners) are plain,
 * non-resizable chrome — those zones triggered accidental resizes near the
 * toolbar. The bottom EDGE itself is the visible bottom bar (a grid row), so
 * it is not listed here. The right edge is inset 12px top and bottom so the
 * top-right corner stays neutral and the bottom-right corner zone wins.
 */
const RESIZE_ZONES: ResizeZone[] = [
  {
    key: 'right',
    label: 'Resize editor width',
    cursor: 'ew-resize',
    edges: { h: 'right', v: null },
    placement: { top: 12, bottom: 12, right: 0, width: 6 },
  },
  {
    key: 'bottom-left',
    label: 'Resize editor',
    cursor: 'nesw-resize',
    edges: { h: 'left', v: 'bottom' },
    placement: { bottom: 0, left: 0, width: 12, height: 12 },
  },
  {
    key: 'bottom-right',
    label: 'Resize editor',
    cursor: 'nwse-resize',
    edges: { h: 'right', v: 'bottom' },
    placement: { bottom: 0, right: 0, width: 12, height: 12 },
  },
];

interface EditorSize {
  width: number | null;
  height: number | null;
}

const clampNumber = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max));

/**
 * A self-contained rich-text editor rendered inside an isolated iframe, with a
 * formatting toolbar and optional AI text tools. Content is controlled via
 * `mailContent` / `setMailContent`.
 */
export function FlowTextEditor({
  mailContent,
  setMailContent,
  resetMailContent = false,
  showAiTools = false,
  modalHeight = '',
  spellcheckIgnoreWords = [],
  onAiTextAction,
}: FlowTextEditorProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [doc, setDoc] = useState<Document | null>(null);
  const [savedRange, setSavedRange] = useState<Range | null>(null);
  // Floating link popover: close() handle while it's open (null when closed).
  const linkPopoverCloseRef = useRef<(() => void) | null>(null);
  const [isErrorToastHidden, setIsErrorToastHidden] = useState(true);
  const [toastErrorMessage, setToastErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isInternalEdit = useRef(false);
  // Toggle buttons whose active state tracks the current selection.
  const toggleButtonsRef = useRef<ToggleButton[]>([]);
  // Buttons whose active state is derived from the DOM (block quote / code
  // block) rather than a queryCommandState — each detects its own block.
  const blockToggleButtonsRef = useRef<{ el: HTMLButtonElement; detect: () => boolean }[]>([]);
  // Contextual controls (paragraph style + font size) kept in sync with the caret.
  const blockTriggerRef = useRef<HTMLButtonElement | null>(null);
  const blockMenuRef = useRef<HTMLDivElement | null>(null);
  const sizeLabelRef = useRef<HTMLSpanElement | null>(null);
  const sizeMenuRef = useRef<HTMLDivElement | null>(null);
  // Alignment dropdown: trigger icon mirrors the active alignment.
  const alignIconRef = useRef<HTMLSpanElement | null>(null);
  const alignMenuRef = useRef<HTMLDivElement | null>(null);
  // List style-picker menus (numbered + bullet) for active-style highlighting.
  const olMenuRef = useRef<HTMLDivElement | null>(null);
  const ulMenuRef = useRef<HTMLDivElement | null>(null);
  // Selection captured when a list-style dropdown opens — the custom-bullet
  // input steals focus, so the live selection can't always be relied on.
  const dropdownRangeRef = useRef<Range | null>(null);
  const currentFontSizeRef = useRef<number>(DEFAULT_FONT_SIZE);
  // Colour tools: indicator bars, palette menus, current + last custom colours.
  const textColorBarRef = useRef<HTMLElement | null>(null);
  const bgColorBarRef = useRef<HTMLElement | null>(null);
  const textColorMenuRef = useRef<HTMLElement | null>(null);
  const bgColorMenuRef = useRef<HTMLElement | null>(null);
  const currentTextColorRef = useRef<string>(DEFAULT_TEXT_COLOR);
  const currentBgColorRef = useRef<string | null>(null); // null = transparent
  const lastCustomColorRef = useRef<{ text: string | null; bg: string | null }>({
    text: null,
    bg: null,
  });
  // Resizable container: null dimensions mean "use the default (responsive) size".
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const [size, setSize] = useState<EditorSize>({ width: null, height: null });

  // --- AI ---------------------------------------------------------------

  const callAiTextAction = async (
    action: AiTextAction,
    text: string,
    wordCount: number | null,
    toneType: AiToneType | null,
  ): Promise<string | null> => {
    if (!onAiTextAction) {
      console.warn(
        '[FlowTextEditor] `onAiTextAction` prop was not provided; AI tools are disabled.',
      );
      return null;
    }
    setLoading(true);
    try {
      const result = await onAiTextAction({ action, text, wordCount, toneType });
      return result ?? null;
    } catch (error) {
      console.error('[FlowTextEditor] AI request failed:', error);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleErrorTextSelection = () => {
    setToastErrorMessage('Please select some text before using AI tools.');
    setIsErrorToastHidden(false);
    setTimeout(() => {
      setIsErrorToastHidden(true);
      setToastErrorMessage(null);
    }, 3000);
  };

  // --- Selection & commands --------------------------------------------

  const saveSelection = () => {
    if (!doc) return;
    const sel = doc.getSelection();
    if (sel && sel.rangeCount > 0) {
      setSavedRange(sel.getRangeAt(0));
    }
  };

  const restoreSelection = () => {
    if (!doc || !savedRange) return;
    const sel = doc.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(savedRange);
  };

  // Reflect the current selection's formatting on the toggle buttons.
  const updateToolbarActiveState = () => {
    if (!doc) return;
    for (const { el, cmd } of toggleButtonsRef.current) {
      let active = false;
      try {
        active = doc.queryCommandState(cmd);
      } catch {
        active = false;
      }
      el.classList.toggle('is-active', active);
      el.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    // DOM-derived toggles (block quote / code block).
    for (const { el, detect } of blockToggleButtonsRef.current) {
      const active = detect();
      el.classList.toggle('is-active', active);
      el.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  };

  // Nearest ancestor of `start` (inside the editor) matching the predicate.
  const closestFromNode = (
    start: Node | null,
    match: (el: HTMLElement) => boolean,
  ): HTMLElement | null => {
    if (!doc) return null;
    const editor = doc.getElementById('editor');
    if (!editor || !start || !editor.contains(start)) return null;
    let node: Node | null = start;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    while (node && node !== editor) {
      if (node.nodeType === Node.ELEMENT_NODE && match(node as HTMLElement)) {
        return node as HTMLElement;
      }
      node = node.parentNode;
    }
    return null;
  };

  const closestFromSelection = (match: (el: HTMLElement) => boolean): HTMLElement | null => {
    const sel = doc?.getSelection();
    return closestFromNode(sel?.anchorNode ?? null, match);
  };

  // Resolve which style option an existing list element corresponds to.
  const listStyleKeyOf = (list: HTMLElement, kind: 'ol' | 'ul'): string => {
    const dataStyle = list.dataset.erteList;
    if (dataStyle) return dataStyle; // 'legal' or 'custom'
    const raw = list.style.listStyleType.trim();
    if (!raw) return kind === 'ol' ? 'decimal' : 'disc';
    const styles = kind === 'ol' ? ORDERED_LIST_STYLES : BULLET_LIST_STYLES;
    const normalize = (value: string) => value.replace(/["']/g, '').trim();
    const match = styles.find(
      (option) => option.css !== null && normalize(option.css) === normalize(raw),
    );
    return match?.key ?? 'custom';
  };

  // Highlight the tile matching the active list's marker style in a picker menu.
  const markListMenu = (kind: 'ol' | 'ul') => {
    const menu = kind === 'ol' ? olMenuRef.current : ulMenuRef.current;
    if (!menu) return;
    const list = closestFromSelection((el) => el.tagName === kind.toUpperCase());
    const activeKey = list ? listStyleKeyOf(list, kind) : null;
    menu.querySelectorAll<HTMLElement>('[data-list-style]').forEach((el) => {
      el.classList.toggle('is-selected', el.dataset.listStyle === activeKey);
    });
  };

  // Sync the paragraph-style label and font-size display to the caret position.
  const syncToolbarState = () => {
    if (!doc) return;
    updateToolbarActiveState();

    // Current block format -> paragraph-menu highlight + trigger tooltip. The
    // semantic Block Quote / Code Block variants are detected from the DOM
    // (formatBlock can't distinguish them from indent-blockquotes / plain pre)
    // and are surfaced on their own toolbar buttons, not this dropdown.
    let block = '';
    try {
      block = String(doc.queryCommandValue('formatBlock') || '').toLowerCase();
    } catch {
      block = '';
    }
    let activeTag = BLOCK_OPTIONS.find((option) => option.tag === block)?.tag ?? 'p';
    const special = closestFromSelection(
      (el) =>
        (el.tagName === 'PRE' && el.hasAttribute('data-erte-code')) ||
        (el.tagName === 'BLOCKQUOTE' && el.hasAttribute('data-erte-quote')),
    );
    // Inside a decorated quote/code block, no plain style is "current".
    if (special) activeTag = special.tagName === 'PRE' ? 'codeblock' : 'blockquote';
    const matched = BLOCK_OPTIONS.find((option) => option.tag === activeTag);
    if (blockTriggerRef.current) {
      blockTriggerRef.current.title = matched ? `Text styles: ${matched.label}` : 'Text styles';
    }
    blockMenuRef.current?.querySelectorAll<HTMLElement>('[data-tag]').forEach((el) => {
      el.classList.toggle('is-selected', el.dataset.tag === activeTag);
    });

    // Current alignment -> dropdown trigger icon + menu highlight.
    let alignKey = 'left';
    for (const option of ALIGN_OPTIONS) {
      try {
        if (doc.queryCommandState(option.cmd)) {
          alignKey = option.key;
          break;
        }
      } catch {
        /* unsupported command — fall through to the default */
      }
    }
    const alignActive = ALIGN_OPTIONS.find((option) => option.key === alignKey);
    if (alignIconRef.current && alignActive) {
      alignIconRef.current.innerHTML = icons[alignActive.iconKey];
    }
    alignMenuRef.current?.querySelectorAll<HTMLElement>('[data-align]').forEach((el) => {
      el.classList.toggle('is-selected', el.dataset.align === alignKey);
    });

    // Current list style -> style-picker highlights (numbered + bullet menus).
    markListMenu('ol');
    markListMenu('ul');

    // Current font size (computed) -> font-size display + menu highlight.
    const view = doc.defaultView;
    const selection = doc.getSelection();
    let node: Node | null = selection?.anchorNode ?? null;
    if (node && node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    if (view && node && node.nodeType === Node.ELEMENT_NODE) {
      const size = Math.round(parseFloat(view.getComputedStyle(node as Element).fontSize));
      if (!Number.isNaN(size)) {
        currentFontSizeRef.current = size;
        if (sizeLabelRef.current) sizeLabelRef.current.textContent = `${size}px`;
        sizeMenuRef.current?.querySelectorAll<HTMLElement>('[data-size]').forEach((el) => {
          el.classList.toggle('is-selected', Number(el.dataset.size) === size);
        });
      }
    }

    // Current caret colours -> split-button indicators + palette highlights.
    const editorRoot = doc.getElementById('editor');
    if (view && node && node.nodeType === Node.ELEMENT_NODE && editorRoot?.contains(node)) {
      const element = node as Element;
      const parsedColor = parseCssColor(view.getComputedStyle(element).color);
      currentTextColorRef.current = parsedColor ? rgbToHex(parsedColor) : DEFAULT_TEXT_COLOR;

      // Background doesn't inherit in computed styles — walk up to the first
      // ancestor with a non-transparent background (stopping at the editor).
      let bgHex: string | null = null;
      let cursor: Element | null = element;
      while (cursor && cursor !== editorRoot) {
        const parsedBg = parseCssColor(view.getComputedStyle(cursor).backgroundColor);
        if (parsedBg && parsedBg.a > 0) {
          bgHex = rgbToHex(parsedBg);
          break;
        }
        cursor = cursor.parentElement;
      }
      currentBgColorRef.current = bgHex;

      updateColorIndicators();
      markSwatches(textColorMenuRef.current, currentTextColorRef.current);
      markSwatches(bgColorMenuRef.current, currentBgColorRef.current);
    }
  };

  const exec = (cmd: string, val: string | null = null) => {
    if (!doc) return;
    restoreSelection();
    doc.execCommand(cmd, false, val ?? undefined);
    syncToolbarState();
  };

  const insertTable = (rows: number, cols: number) => {
    if (!doc) return;
    restoreSelection();
    doc.execCommand('insertHTML', false, getTableHtml(rows, cols));
  };

  // --- Link tool ----------------------------------------------------------

  // Closest <a> around the range (checked from both ends so a caret inside a
  // link, or a partial selection of one, still finds it).
  const findLinkInRange = (range: Range): HTMLAnchorElement | null => {
    if (!doc) return null;
    const editor = doc.getElementById('editor');
    if (!editor) return null;
    const closestAnchor = (start: Node | null): HTMLAnchorElement | null => {
      let node: Node | null = start;
      while (node && node !== editor) {
        if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'A') {
          return node as HTMLAnchorElement;
        }
        node = node.parentNode;
      }
      return null;
    };
    return (
      closestAnchor(range.commonAncestorContainer) ??
      closestAnchor(range.startContainer) ??
      closestAnchor(range.endContainer)
    );
  };

  // Refocus the editor and re-select `range` (falling back to the end of the
  // content) so execCommand acts on the text the popover was opened for.
  const restoreLinkRange = (range: Range | null): Selection | null => {
    if (!doc) return null;
    const selection = doc.getSelection();
    const editor = doc.getElementById('editor');
    if (!selection || !editor) return null;
    editor.focus();
    let target = range;
    if (!target) {
      target = doc.createRange();
      target.selectNodeContents(editor);
      target.collapse(false);
    }
    selection.removeAllRanges();
    selection.addRange(target);
    return selection;
  };

  // Insert a new link, or update the one the caret/selection is on. Uses
  // execCommand so the edit participates in undo/redo.
  const applyLink = (url: string, range: Range | null, existingLink: HTMLAnchorElement | null) => {
    if (!doc) return;
    const selection = restoreLinkRange(range);
    if (!selection) return;

    if (existingLink && existingLink.isConnected) {
      // Re-link the whole anchor so a caret inside it updates the entire link.
      // Unlink first: createLink on a selection inside an existing anchor
      // NESTS a new <a> instead of updating the old one.
      const linkRange = doc.createRange();
      linkRange.selectNodeContents(existingLink);
      selection.removeAllRanges();
      selection.addRange(linkRange);
      doc.execCommand('unlink');
      doc.execCommand('createLink', false, url);
    } else if (!selection.isCollapsed) {
      doc.execCommand('createLink', false, url);
    } else {
      // Nothing selected: insert the URL itself as linked text.
      const escaped = url
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
      doc.execCommand('insertHTML', false, `<a href="${escaped}">${escaped}</a>`);
    }
    saveSelection();
    propagateContent();
    syncToolbarState();
  };

  // Remove the hyperlink while keeping its text and formatting.
  const removeLink = (range: Range | null, existingLink: HTMLAnchorElement | null) => {
    if (!doc) return;
    const selection = restoreLinkRange(range);
    if (!selection) return;
    if (existingLink && existingLink.isConnected) {
      const linkRange = doc.createRange();
      linkRange.selectNodeContents(existingLink);
      selection.removeAllRanges();
      selection.addRange(linkRange);
    }
    doc.execCommand('unlink');
    saveSelection();
    propagateContent();
    syncToolbarState();
  };

  // Toggle the floating link popover anchored to the toolbar link button,
  // preserving the editor selection across the focus change into its input.
  const toggleLinkPopover = (button: HTMLElement) => {
    if (!doc) return;
    if (linkPopoverCloseRef.current) {
      linkPopoverCloseRef.current();
      return;
    }
    saveSelection();
    const selection = doc.getSelection();
    const range =
      selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;
    const existingLink = range ? findLinkInRange(range) : null;
    linkPopoverCloseRef.current = openLinkPopover({
      doc,
      anchor: button,
      initialUrl: existingLink?.getAttribute('href') ?? '',
      hasLink: existingLink !== null,
      onApply: (url) => applyLink(url, range, existingLink),
      onRemove: () => removeLink(range, existingLink),
      onClose: (reason) => {
        linkPopoverCloseRef.current = null;
        // Hand focus/selection back to the editor unless the user clicked
        // elsewhere; apply/remove already restored it themselves.
        if (reason === 'escape' || reason === 'programmatic') {
          restoreLinkRange(range);
          syncToolbarState();
        }
      },
    });
  };

  // Push the editor's current HTML to the parent. Needed after manual DOM edits
  // that don't fire an `input` event (e.g. the collapsed font-size insertion).
  const propagateContent = () => {
    if (!doc) return;
    const editor = doc.getElementById('editor');
    if (!editor) return;
    isInternalEdit.current = true;
    setMailContent(editor.innerHTML);
    setTimeout(() => {
      isInternalEdit.current = false;
    }, 100);
  };

  const applyInlineStyles = (el: HTMLElement, styles: Partial<CSSStyleDeclaration>) => {
    Object.assign(el.style, styles);
  };

  // Decorate the blockquote/pre around each selection endpoint with inline
  // styles (email-export friendly) and a marker attribute for detection.
  const decorateSelectionBlocks = (tagName: 'BLOCKQUOTE' | 'PRE') => {
    if (!doc) return;
    const selection = doc.getSelection();
    if (!selection) return;
    const attr = tagName === 'PRE' ? 'data-erte-code' : 'data-erte-quote';
    const styles = tagName === 'PRE' ? CODE_BLOCK_INLINE_STYLE : QUOTE_INLINE_STYLE;
    for (const endpoint of [selection.anchorNode, selection.focusNode]) {
      const blockEl = closestFromNode(
        endpoint,
        (el) => el.tagName === tagName && !el.hasAttribute(attr),
      );
      if (blockEl) {
        blockEl.setAttribute(attr, 'true');
        applyInlineStyles(blockEl, styles);
      }
    }
  };

  // Apply a block-level format. Handles the two decorated pseudo-formats on
  // top of formatBlock: Block Quote (semantic, styled blockquote) and Code
  // Block (styled `<pre data-erte-code>`). Re-selecting Block Quote toggles it
  // off; `outdent` is the reliable cross-engine way to unwrap a blockquote.
  // Inline properties that would otherwise fight a semantic block's own styling
  // (exported email HTML bakes these onto every heading/paragraph). Clearing
  // them lets the h1–h6 / p / pre CSS actually take effect on style change.
  const BLOCK_OVERRIDE_PROPS = ['font-size', 'font-weight', 'line-height', 'margin'] as const;

  const stripBlockOverrides = (el: HTMLElement) => {
    BLOCK_OVERRIDE_PROPS.forEach((prop) => el.style.removeProperty(prop));
    // Legacy shorthands that also carry margins.
    ['margin-top', 'margin-bottom'].forEach((prop) => el.style.removeProperty(prop));
    if (!el.getAttribute('style')) el.removeAttribute('style');
  };

  // Strip overriding inline styles from every `tag` block touched by the
  // selection (covers single- and multi-block selections).
  const stripBlocksInSelection = (tag: string) => {
    if (!doc) return;
    const selection = doc.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const upper = tag.toUpperCase();
    const blocks = new Set<HTMLElement>();
    for (const endpoint of [range.startContainer, range.endContainer]) {
      const el = closestFromNode(endpoint, (node) => node.tagName === upper);
      if (el) blocks.add(el);
    }
    let root: Node | null = range.commonAncestorContainer;
    if (root.nodeType === Node.TEXT_NODE) root = root.parentElement;
    if (root && root.nodeType === Node.ELEMENT_NODE) {
      (root as Element).querySelectorAll<HTMLElement>(tag).forEach((el) => {
        if (range.intersectsNode(el)) blocks.add(el);
      });
    }
    blocks.forEach(stripBlockOverrides);
  };

  const applyBlockFormat = (tag: string) => {
    if (!doc) return;
    // Prefer the selection captured when the dropdown opened (robust against a
    // stale saved range); fall back to the live selection.
    const savedDropdownRange = dropdownRangeRef.current;
    if (savedDropdownRange) {
      const selection = doc.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(savedDropdownRange);
      }
    } else {
      restoreSelection();
    }
    const quote = closestFromSelection(
      (el) => el.tagName === 'BLOCKQUOTE' && el.hasAttribute('data-erte-quote'),
    );
    const code = closestFromSelection(
      (el) => el.tagName === 'PRE' && el.hasAttribute('data-erte-code'),
    );

    if (tag === 'blockquote') {
      if (quote) {
        doc.execCommand('outdent');
      } else {
        doc.execCommand('formatBlock', false, '<blockquote>');
        decorateSelectionBlocks('BLOCKQUOTE');
      }
    } else if (tag === 'codeblock') {
      if (code) {
        // Toggle off: Code Block -> Paragraph (drop decoration, unwrap <pre>).
        code.removeAttribute('data-erte-code');
        code.removeAttribute('style');
        doc.execCommand('formatBlock', false, '<p>');
        stripBlocksInSelection('p');
      } else {
        if (quote) doc.execCommand('outdent');
        doc.execCommand('formatBlock', false, '<pre>');
        decorateSelectionBlocks('PRE');
      }
    } else if (tag === 'pre' && code) {
      // Code Block -> plain Preformatted: same element, drop the decoration.
      code.removeAttribute('data-erte-code');
      code.removeAttribute('style');
    } else {
      if (quote) doc.execCommand('outdent');
      doc.execCommand('formatBlock', false, `<${tag}>`);
      // Remove exported inline font-size/weight so the semantic style shows.
      stripBlocksInSelection(tag);
    }
    propagateContent();
    syncToolbarState();
  };

  // Apply a marker style to the list containing the caret, creating the list
  // first when the caret isn't in one. Styles are inline `list-style-type`
  // (survives email export); "legal" is attribute + editor CSS counters.
  const applyListStyle = (kind: 'ol' | 'ul', styleKey: string, cssValue: string | null) => {
    if (!doc) return;
    const saved = dropdownRangeRef.current;
    if (saved) {
      const selection = doc.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(saved);
      }
    }
    const tagName = kind === 'ol' ? 'OL' : 'UL';
    const findList = () => closestFromSelection((el) => el.tagName === tagName);
    let list = findList();
    if (!list) {
      doc.execCommand(kind === 'ol' ? 'insertOrderedList' : 'insertUnorderedList');
      list = findList();
    }
    if (!list) return;
    if (cssValue === null) {
      list.dataset.erteList = styleKey;
      list.style.listStyleType = styleKey === 'legal' ? 'none' : '';
    } else {
      if (styleKey === 'custom') list.dataset.erteList = 'custom';
      else delete list.dataset.erteList;
      list.style.listStyleType = cssValue;
    }
    propagateContent();
    syncToolbarState();
  };

  // Remove all indentation at the caret: unwrap indent-blockquotes, inline
  // margins and nested-list levels via repeated outdent (bounded, and only
  // while indentation is actually present so lists themselves survive).
  const resetIndentation = () => {
    if (!doc) return;
    restoreSelection();
    const editor = doc.getElementById('editor');
    if (!editor) return;
    const hasIndentation = () => {
      let listDepth = 0;
      let found = false;
      closestFromSelection((el) => {
        if (el.tagName === 'BLOCKQUOTE' && !el.hasAttribute('data-erte-quote')) found = true;
        if (el.tagName === 'OL' || el.tagName === 'UL') listDepth += 1;
        if (parseFloat(el.style.marginLeft || '0') > 0) found = true;
        return false; // walk the whole ancestor chain
      });
      return found || listDepth > 1;
    };
    for (let i = 0; i < 10 && hasIndentation(); i++) {
      doc.execCommand('outdent');
    }
    propagateContent();
    syncToolbarState();
  };

  // Insert a horizontal rule and give it inline styling (email-export friendly).
  const insertHorizontalRule = () => {
    if (!doc) return;
    restoreSelection();
    doc.execCommand('insertHorizontalRule');
    doc
      .getElementById('editor')
      ?.querySelectorAll<HTMLElement>('hr:not([data-erte-hr])')
      .forEach((hr) => {
        hr.setAttribute('data-erte-hr', 'true');
        applyInlineStyles(hr, HR_INLINE_STYLE);
      });
    propagateContent();
    syncToolbarState();
  };

  // Collapsed-selection styling: seed an empty styled span at the caret so
  // newly typed text inherits the style (shared by font-size + colour tools).
  const insertTypingSpan = (decorate: (span: HTMLSpanElement) => void) => {
    if (!doc) return;
    const selection = doc.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const span = doc.createElement('span');
    decorate(span);
    span.appendChild(doc.createTextNode(String.fromCharCode(0x200b))); // zero-width space
    range.insertNode(span);
    const caret = doc.createRange();
    if (span.firstChild) caret.setStart(span.firstChild, 1);
    caret.collapse(true);
    selection.removeAllRanges();
    selection.addRange(caret);
  };

  // Apply a pixel font size to the selection, or to text typed next when the
  // selection is collapsed.
  const applyFontSize = (px: number) => {
    if (!doc) return;
    const editor = doc.getElementById('editor');
    const selection = doc.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;

    const size = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(px)));

    if (selection.isCollapsed) {
      insertTypingSpan((span) => {
        span.style.fontSize = `${size}px`;
      });
    } else {
      // Use the legacy fontSize command as a reliable cross-browser selection
      // wrapper, then rewrite the resulting <font> nodes to an inline px style.
      doc.execCommand('styleWithCSS', false, 'false');
      doc.execCommand('fontSize', false, '7');
      const restyled: HTMLElement[] = [];
      editor.querySelectorAll('font[size="7"]').forEach((font) => {
        const parent = font.parentElement;
        // Repeated +/− on the same run: restyle the existing size span in
        // place instead of nesting a fresh span on every click.
        if (
          parent &&
          parent.tagName === 'SPAN' &&
          parent.childNodes.length === 1 &&
          parent.style.length === 1 &&
          parent.style.fontSize
        ) {
          parent.style.fontSize = `${size}px`;
          while (font.firstChild) parent.appendChild(font.firstChild);
          font.remove();
          restyled.push(parent);
        } else {
          const span = doc.createElement('span');
          span.style.fontSize = `${size}px`;
          while (font.firstChild) span.appendChild(font.firstChild);
          font.replaceWith(span);
          restyled.push(span);
        }
      });

      // The rewrite above destroys the live selection. Rebuild it across the
      // restyled region — anchored INSIDE the first/last span so the toolbar
      // sync reads the new size — letting +/− be clicked repeatedly without
      // ever reselecting.
      const first = restyled[0];
      const last = restyled[restyled.length - 1];
      if (first && last) {
        const range = doc.createRange();
        range.setStart(first, 0);
        range.setEnd(last, last.childNodes.length);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }

    currentFontSizeRef.current = size;
    propagateContent();
    syncToolbarState();
  };

  const stepFontSize = (delta: number) => {
    applyFontSize(currentFontSizeRef.current + delta);
  };

  // --- Colour tools -------------------------------------------------------

  // Paint the split-button indicator bars from the current colour refs.
  const updateColorIndicators = () => {
    const textBar = textColorBarRef.current;
    if (textBar) textBar.style.background = currentTextColorRef.current;
    const bgBar = bgColorBarRef.current;
    if (bgBar) {
      const bg = currentBgColorRef.current;
      bgBar.classList.toggle('is-transparent', !bg);
      bgBar.style.background = bg ?? '';
    }
  };

  // Highlight the swatch matching the current colour inside a palette menu;
  // when no colour is active, "Remove color" is the selected option instead.
  const markSwatches = (menu: HTMLElement | null, hex: string | null) => {
    if (!menu) return;
    menu.querySelectorAll<HTMLElement>('[data-color]').forEach((el) => {
      el.classList.toggle('is-selected', !!hex && el.dataset.color === hex);
    });
    menu
      .querySelector<HTMLElement>('.erte-color-remove')
      ?.classList.toggle('is-selected', hex === null);
  };

  // Apply a text / highlight colour to the selection (or to text typed next
  // when collapsed). `null` removes the colour: text reverts to the editor
  // default, highlight becomes transparent. Callers ensure the editor
  // selection is live (palette buttons preventDefault on mousedown).
  const applyColor = (kind: ColorKind, color: string | null) => {
    if (!doc) return;
    const selection = doc.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const cssValue = kind === 'text' ? (color ?? DEFAULT_TEXT_COLOR) : (color ?? 'transparent');

    if (selection.isCollapsed) {
      insertTypingSpan((span) => {
        if (kind === 'text') span.style.color = cssValue;
        else span.style.backgroundColor = cssValue;
      });
    } else {
      doc.execCommand('styleWithCSS', false, 'true');
      if (kind === 'text') {
        doc.execCommand('foreColor', false, cssValue);
      } else if (!doc.execCommand('hiliteColor', false, cssValue)) {
        // Some engines only implement the legacy alias.
        doc.execCommand('backColor', false, cssValue);
      }
    }

    if (kind === 'text') currentTextColorRef.current = cssValue;
    else currentBgColorRef.current = color;
    updateColorIndicators();
    propagateContent();
    syncToolbarState();
  };

  // Open the custom colour picker modal, preserving the editor selection
  // across the focus change into the picker's inputs.
  const openCustomPicker = (kind: ColorKind) => {
    if (!doc) return;
    const selection = doc.getSelection();
    const range =
      selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;
    const restoreRange = () => {
      if (!range || !selection) return;
      selection.removeAllRanges();
      selection.addRange(range);
    };
    const initialColor =
      kind === 'text'
        ? (lastCustomColorRef.current.text ?? currentTextColorRef.current)
        : (lastCustomColorRef.current.bg ?? currentBgColorRef.current ?? '#fbeeb8');
    openColorPicker({
      doc,
      initialColor,
      title: kind === 'text' ? 'Text color' : 'Highlight color',
      onSave: (hex) => {
        if (kind === 'text') lastCustomColorRef.current.text = hex;
        else lastCustomColorRef.current.bg = hex;
        restoreRange();
        applyColor(kind, hex);
      },
      onCancel: restoreRange,
    });
  };

  // --- Toolbar ----------------------------------------------------------

  const runAiAction = async (
    action: AiTextAction,
    computeWordCount: ((text: string) => number) | null,
    toneType: AiToneType | null,
  ) => {
    if (!doc) return;
    saveSelection();
    const selectedText = doc.getSelection()?.toString() ?? '';
    if (!selectedText) {
      handleErrorTextSelection();
      return;
    }
    const wordCount = computeWordCount ? computeWordCount(selectedText) : null;
    const result = await callAiTextAction(action, selectedText, wordCount, toneType);
    if (result) exec('insertText', result);
  };

  // Mark each group that starts a (possibly wrapped) toolbar row so its
  // left-gap separator is hidden — separators then never open or close a row.
  const updateToolbarRowStarts = () => {
    if (!doc) return;
    const toolbar = doc.getElementById('toolbar');
    if (!toolbar) return;
    let prevLeft = Number.POSITIVE_INFINITY;
    toolbar.querySelectorAll<HTMLElement>('.erte-toolbar-group').forEach((group) => {
      // A group starts a row when it sits at or left of its predecessor.
      const isRowStart = group.offsetLeft <= prevLeft;
      group.classList.toggle('erte-row-start', isRowStart);
      prevLeft = group.offsetLeft;
    });
  };

  const renderToolbar = () => {
    if (!doc) return;
    const editorDoc = doc;
    const toolbar = editorDoc.getElementById('toolbar');
    if (!toolbar) return;

    toolbar.innerHTML = '';
    toggleButtonsRef.current = [];
    blockToggleButtonsRef.current = [];

    const makeButton = (config: {
      icon: string;
      title: string;
      cmd?: string;
      onClick?: () => void;
    }) => {
      const btn = editorDoc.createElement('button');
      btn.type = 'button';
      btn.className = 'erte-btn';
      btn.title = config.title;
      btn.setAttribute('aria-label', config.title);
      btn.innerHTML = config.icon;
      btn.onclick = (event) => {
        event.preventDefault();
        if (config.onClick) {
          config.onClick();
          return;
        }
        if (config.cmd) exec(config.cmd);
      };
      if (config.cmd && TOGGLE_COMMANDS.has(config.cmd)) {
        btn.setAttribute('aria-pressed', 'false');
        toggleButtonsRef.current.push({ el: btn, cmd: config.cmd });
      }
      return btn;
    };

    const makeGroup = (items: HTMLElement[]) => {
      const group = editorDoc.createElement('div');
      group.className = 'erte-toolbar-group';
      items.forEach((item) => group.appendChild(item));
      return group;
    };

    // --- Dropdown (select) plumbing --------------------------------------

    const closeAllDropdowns = () => {
      editorDoc.querySelectorAll<HTMLElement>('.erte-select-wrap.is-open').forEach((wrap) => {
        wrap.classList.remove('is-open');
        wrap.querySelector('.erte-select')?.setAttribute('aria-expanded', 'false');
      });
    };

    // Floating-UI-lite: keep an open menu fully inside the iframe viewport —
    // shift it left when it would overflow the right edge, flip it above the
    // trigger when there isn't room below. Prevents clipping by `body`'s
    // `overflow: hidden` when the trigger sits near the editor's right edge.
    const positionMenu = (wrap: HTMLElement) => {
      const menu = wrap.querySelector<HTMLElement>('.erte-select-menu');
      if (!menu) return;
      const MARGIN = 8;
      // Reset to the default anchor before measuring.
      menu.style.left = '0px';
      menu.style.right = 'auto';
      menu.style.top = '';
      menu.style.bottom = '';

      const wrapRect = wrap.getBoundingClientRect();
      const viewportW = editorDoc.documentElement.clientWidth;
      const viewportH = editorDoc.documentElement.clientHeight;
      const menuW = menu.offsetWidth;
      const menuH = menu.offsetHeight;

      // Horizontal: align to the trigger, clamped so the menu never overflows.
      const targetLeft = Math.max(MARGIN, Math.min(wrapRect.left, viewportW - MARGIN - menuW));
      menu.style.left = `${Math.round(targetLeft - wrapRect.left)}px`;

      // Vertical: flip above when the menu won't fit below and there's room up.
      if (viewportH - wrapRect.bottom < menuH + MARGIN && wrapRect.top > menuH + MARGIN) {
        menu.style.top = 'auto';
        menu.style.bottom = 'calc(100% + 4px)';
      }
    };

    const toggleDropdown = (wrap: HTMLElement) => {
      const willOpen = !wrap.classList.contains('is-open');
      closeAllDropdowns();
      if (willOpen) {
        wrap.classList.add('is-open');
        wrap.querySelector('.erte-select')?.setAttribute('aria-expanded', 'true');
        positionMenu(wrap);
      }
    };

    interface SelectOption {
      key: string;
      label: string;
      optionClass?: string;
      dataAttr: 'data-tag' | 'data-size';
      onSelect: () => void;
    }

    // Generic dropdown: styled trigger + popup listbox. The trigger shows an
    // icon when `triggerIconHtml` is given (e.g. the paragraph-style control),
    // otherwise a text label that callers keep in sync (e.g. font size).
    const makeSelect = (
      options: SelectOption[],
      config: {
        title: string;
        triggerClass?: string;
        menuClass?: string;
        initialLabel: string;
        triggerIconHtml?: string;
      },
    ) => {
      const wrap = editorDoc.createElement('div');
      wrap.className = 'erte-select-wrap';

      const trigger = editorDoc.createElement('button');
      trigger.type = 'button';
      trigger.className = `erte-select${config.triggerClass ? ` ${config.triggerClass}` : ''}`;
      trigger.title = config.title;
      trigger.setAttribute('aria-label', config.title);
      trigger.setAttribute('aria-haspopup', 'listbox');
      trigger.setAttribute('aria-expanded', 'false');

      const caret = editorDoc.createElement('span');
      caret.className = 'erte-select-caret';
      caret.setAttribute('aria-hidden', 'true');

      let label: HTMLSpanElement | null = null;
      if (config.triggerIconHtml) {
        const icon = editorDoc.createElement('span');
        icon.className = 'erte-select-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML = config.triggerIconHtml;
        trigger.append(icon, caret);
      } else {
        label = editorDoc.createElement('span');
        label.className = 'erte-select-label';
        label.textContent = config.initialLabel;
        trigger.append(label, caret);
      }

      const menu = editorDoc.createElement('div');
      menu.className = `erte-select-menu${config.menuClass ? ` ${config.menuClass}` : ''}`;
      menu.setAttribute('role', 'listbox');

      options.forEach((option) => {
        const item = editorDoc.createElement('button');
        item.type = 'button';
        item.className = `erte-option${option.optionClass ? ` ${option.optionClass}` : ''}`;
        item.setAttribute('role', 'option');
        item.setAttribute(option.dataAttr, option.key);
        item.textContent = option.label;
        // Preserve the editor selection when interacting with the menu.
        item.addEventListener('mousedown', (event) => event.preventDefault());
        item.addEventListener('click', (event) => {
          event.preventDefault();
          option.onSelect();
          closeAllDropdowns();
        });
        menu.appendChild(item);
      });

      trigger.addEventListener('mousedown', (event) => event.preventDefault());
      trigger.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        // Snapshot the live selection before the menu opens so the chosen
        // option acts on the right text even if focus/selection shifts.
        saveSelection();
        const sel = editorDoc.getSelection();
        dropdownRangeRef.current =
          sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
        toggleDropdown(wrap);
      });

      wrap.append(trigger, menu);
      return { wrap, trigger, label, menu };
    };

    // Icon-triggered dropdown: a compact icon button + caret opens a popup the
    // caller fills. Used for alignment, list styles, indent, and "more". The
    // whole trigger opens the menu (no split action), keeping the toolbar slim.
    const makeIconDropdown = (config: {
      title: string;
      triggerHtml: string;
      triggerClass?: string;
      menuClass?: string;
    }) => {
      const wrap = editorDoc.createElement('div');
      wrap.className = 'erte-select-wrap';

      const trigger = editorDoc.createElement('button');
      trigger.type = 'button';
      trigger.className = `erte-select erte-icon-select${
        config.triggerClass ? ` ${config.triggerClass}` : ''
      }`;
      trigger.title = config.title;
      trigger.setAttribute('aria-label', config.title);
      trigger.setAttribute('aria-haspopup', 'menu');
      trigger.setAttribute('aria-expanded', 'false');

      const icon = editorDoc.createElement('span');
      icon.className = 'erte-icon-select-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = config.triggerHtml;

      const caret = editorDoc.createElement('span');
      caret.className = 'erte-select-caret';
      caret.setAttribute('aria-hidden', 'true');
      trigger.append(icon, caret);

      const menu = editorDoc.createElement('div');
      menu.className = `erte-select-menu${config.menuClass ? ` ${config.menuClass}` : ''}`;
      menu.setAttribute('role', 'menu');

      trigger.addEventListener('mousedown', (event) => event.preventDefault());
      trigger.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        // Capture the live selection before the menu (and any focus-stealing
        // control inside it, e.g. the custom-bullet input) can drop it.
        saveSelection();
        const sel = editorDoc.getSelection();
        dropdownRangeRef.current =
          sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
        toggleDropdown(wrap);
      });

      wrap.append(trigger, menu);
      return { wrap, trigger, icon, menu };
    };

    // A single menu row: leading icon/preview + text label, with an optional
    // data attribute so the active item can be highlighted from syncToolbarState.
    const makeMenuItem = (config: {
      leadingHtml?: string;
      label: string;
      data?: { attr: string; value: string };
      onSelect: () => void;
    }) => {
      const item = editorDoc.createElement('button');
      item.type = 'button';
      item.className = 'erte-menu-item';
      item.setAttribute('role', 'menuitem');
      if (config.data) item.setAttribute(config.data.attr, config.data.value);
      if (config.leadingHtml !== undefined) {
        const lead = editorDoc.createElement('span');
        lead.className = 'erte-menu-item-lead';
        lead.setAttribute('aria-hidden', 'true');
        lead.innerHTML = config.leadingHtml;
        item.appendChild(lead);
      }
      const text = editorDoc.createElement('span');
      text.className = 'erte-menu-item-label';
      text.textContent = config.label;
      item.appendChild(text);
      item.addEventListener('mousedown', (event) => event.preventDefault());
      item.addEventListener('click', (event) => {
        event.preventDefault();
        config.onSelect();
        closeAllDropdowns();
      });
      return item;
    };

    const makeStepButton = (glyph: string, title: string, onClick: () => void) => {
      const btn = editorDoc.createElement('button');
      btn.type = 'button';
      btn.className = 'erte-btn erte-step-btn';
      btn.title = title;
      btn.setAttribute('aria-label', title);
      btn.textContent = glyph;
      btn.addEventListener('mousedown', (event) => event.preventDefault());
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        onClick();
      });
      return btn;
    };

    // Interactive table-insert picker: hover a 10×8 grid to choose the size,
    // click to insert (replaces the old rows/columns modal).
    const makeTablePicker = () => {
      const GRID_COLS = 10;
      const GRID_ROWS = 8;
      const wrap = editorDoc.createElement('div');
      wrap.className = 'erte-select-wrap erte-table-wrap';

      const trigger = editorDoc.createElement('button');
      trigger.type = 'button';
      trigger.className = 'erte-btn';
      trigger.title = 'Insert table';
      trigger.setAttribute('aria-label', 'Insert table');
      trigger.setAttribute('aria-haspopup', 'dialog');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.innerHTML = icons.table;
      trigger.addEventListener('mousedown', (event) => event.preventDefault());
      trigger.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleDropdown(wrap);
      });

      const menu = editorDoc.createElement('div');
      menu.className = 'erte-select-menu erte-table-menu';

      const grid = editorDoc.createElement('div');
      grid.className = 'erte-table-grid';
      const label = editorDoc.createElement('div');
      label.className = 'erte-table-label';
      label.textContent = '1 × 1';

      const highlight = (cols: number, rows: number) => {
        grid.querySelectorAll<HTMLElement>('.erte-table-cell').forEach((el) => {
          el.classList.toggle(
            'is-on',
            Number(el.dataset.c) <= cols && Number(el.dataset.r) <= rows,
          );
        });
        label.textContent = `${cols} × ${rows}`;
      };

      for (let r = 1; r <= GRID_ROWS; r++) {
        for (let c = 1; c <= GRID_COLS; c++) {
          const cell = editorDoc.createElement('button');
          cell.type = 'button';
          cell.className = 'erte-table-cell';
          cell.dataset.c = String(c);
          cell.dataset.r = String(r);
          cell.setAttribute('aria-label', `${c} × ${r} table`);
          cell.addEventListener('mouseover', () => highlight(c, r));
          cell.addEventListener('focus', () => highlight(c, r));
          cell.addEventListener('mousedown', (event) => event.preventDefault());
          cell.addEventListener('click', (event) => {
            event.preventDefault();
            insertTable(r, c);
            closeAllDropdowns();
            highlight(0, 0);
            label.textContent = '1 × 1';
          });
          grid.appendChild(cell);
        }
      }
      grid.addEventListener('mouseleave', () => {
        highlight(0, 0);
        label.textContent = '1 × 1';
      });

      menu.append(grid, label);
      wrap.append(trigger, menu);
      return wrap;
    };

    // Paragraph / block-style dropdown. The trigger is a fixed "text styles"
    // icon (recognizable + compact); syncToolbarState keeps the menu highlight
    // and tooltip current. Styles only — quote/code are their own buttons.
    const paragraph = makeSelect(
      BLOCK_OPTIONS.map((option) => ({
        key: option.tag,
        label: option.label,
        optionClass: option.optionClass,
        dataAttr: 'data-tag' as const,
        onSelect: () => applyBlockFormat(option.tag),
      })),
      {
        title: 'Text styles',
        triggerClass: 'erte-select--block',
        menuClass: 'erte-select-menu--block',
        initialLabel: '',
        triggerIconHtml: icons.paragraph,
      },
    );
    blockTriggerRef.current = paragraph.trigger;
    blockMenuRef.current = paragraph.menu;

    // Font-size control: [ − ] [ size ▾ ] [ + ].
    const fontSize = makeSelect(
      FONT_SIZES.map((size) => ({
        key: String(size),
        label: `${size}px`,
        dataAttr: 'data-size' as const,
        onSelect: () => applyFontSize(size),
      })),
      {
        title: 'Font size',
        triggerClass: 'erte-select--size',
        menuClass: 'erte-select-menu--size',
        initialLabel: `${DEFAULT_FONT_SIZE}px`,
      },
    );
    sizeLabelRef.current = fontSize.label;
    sizeMenuRef.current = fontSize.menu;

    // Dedicated Block Quote / Code Block buttons (kept out of the style menu).
    // Each toggles its block and lights up when the caret is inside it.
    const makeBlockToggle = (config: {
      icon: string;
      title: string;
      tag: 'blockquote' | 'codeblock';
      detect: () => boolean;
    }) => {
      const btn = makeButton({
        icon: config.icon,
        title: config.title,
        onClick: () => applyBlockFormat(config.tag),
      });
      btn.addEventListener('mousedown', (event) => event.preventDefault());
      btn.setAttribute('aria-pressed', 'false');
      blockToggleButtonsRef.current.push({ el: btn, detect: config.detect });
      return btn;
    };

    const blockQuoteBtn = makeBlockToggle({
      icon: icons.quote,
      title: 'Block quote',
      tag: 'blockquote',
      detect: () =>
        !!closestFromSelection(
          (el) => el.tagName === 'BLOCKQUOTE' && el.hasAttribute('data-erte-quote'),
        ),
    });
    const codeBlockBtn = makeBlockToggle({
      icon: icons.code,
      title: 'Code block',
      tag: 'codeblock',
      detect: () =>
        !!closestFromSelection((el) => el.tagName === 'PRE' && el.hasAttribute('data-erte-code')),
    });

    // Block-format group: [ ¶ styles ▾ ] [ ❝ quote ] [ </> code ].
    const blockGroup = editorDoc.createElement('div');
    blockGroup.className = 'erte-toolbar-group erte-block-group';
    blockGroup.append(paragraph.wrap, blockQuoteBtn, codeBlockBtn);

    // Font-size group: [ − ] [ size ▾ ] [ + ].
    const styleGroup = editorDoc.createElement('div');
    styleGroup.className = 'erte-toolbar-group erte-style-group';
    styleGroup.append(
      makeStepButton('−', 'Decrease font size', () => stepFontSize(-1)),
      fontSize.wrap,
      makeStepButton('+', 'Increase font size', () => stepFontSize(1)),
    );

    // Colour split-button: main button re-applies the indicated colour, the
    // caret opens a palette (remove / preset grid / custom picker).
    const makeColorControl = (kind: ColorKind) => {
      const isText = kind === 'text';
      const wrap = editorDoc.createElement('div');
      wrap.className = 'erte-select-wrap erte-split-wrap erte-color-wrap';

      const main = editorDoc.createElement('button');
      main.type = 'button';
      main.className = 'erte-btn erte-split-main erte-color-btn';
      main.title = isText ? 'Text color' : 'Highlight color';
      main.setAttribute('aria-label', main.title);
      main.innerHTML = `${isText ? '<span class="erte-color-glyph">A</span>' : icons.highlighter}`;
      const bar = editorDoc.createElement('span');
      bar.className = 'erte-color-bar';
      bar.setAttribute('aria-hidden', 'true');
      main.appendChild(bar);
      main.addEventListener('mousedown', (event) => event.preventDefault());
      main.addEventListener('click', (event) => {
        event.preventDefault();
        applyColor(kind, isText ? currentTextColorRef.current : currentBgColorRef.current);
      });

      const caretBtn = editorDoc.createElement('button');
      caretBtn.type = 'button';
      caretBtn.className = 'erte-select erte-split-caret erte-color-caret';
      caretBtn.title = isText ? 'Text color palette' : 'Highlight color palette';
      caretBtn.setAttribute('aria-label', caretBtn.title);
      caretBtn.setAttribute('aria-haspopup', 'listbox');
      caretBtn.setAttribute('aria-expanded', 'false');
      caretBtn.innerHTML = '<span class="erte-select-caret"></span>';
      caretBtn.addEventListener('mousedown', (event) => event.preventDefault());
      caretBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleDropdown(wrap);
      });

      const menu = editorDoc.createElement('div');
      menu.className = 'erte-select-menu erte-color-menu';

      const removeBtn = editorDoc.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'erte-color-remove';
      removeBtn.innerHTML = `${icons.check}<span>Remove color</span>`;
      removeBtn.addEventListener('mousedown', (event) => event.preventDefault());
      removeBtn.addEventListener('click', (event) => {
        event.preventDefault();
        applyColor(kind, null);
        closeAllDropdowns();
      });

      const grid = editorDoc.createElement('div');
      grid.className = 'erte-color-grid';
      COLOR_PALETTE.forEach(({ hex, name }) => {
        const swatch = editorDoc.createElement('button');
        swatch.type = 'button';
        swatch.className = 'erte-color-swatch';
        swatch.title = name;
        swatch.setAttribute('aria-label', name);
        swatch.dataset.color = hex;
        swatch.style.background = hex;
        swatch.addEventListener('mousedown', (event) => event.preventDefault());
        swatch.addEventListener('click', (event) => {
          event.preventDefault();
          applyColor(kind, hex);
          closeAllDropdowns();
        });
        grid.appendChild(swatch);
      });

      const customBtn = editorDoc.createElement('button');
      customBtn.type = 'button';
      customBtn.className = 'erte-color-custom';
      customBtn.innerHTML = `${icons.palette}<span>Custom color&hellip;</span>`;
      customBtn.addEventListener('mousedown', (event) => event.preventDefault());
      customBtn.addEventListener('click', (event) => {
        event.preventDefault();
        closeAllDropdowns();
        openCustomPicker(kind);
      });

      menu.append(removeBtn, grid, customBtn);
      wrap.append(main, caretBtn, menu);

      if (isText) {
        textColorBarRef.current = bar;
        textColorMenuRef.current = menu;
      } else {
        bgColorBarRef.current = bar;
        bgColorMenuRef.current = menu;
      }
      return wrap;
    };

    const colorGroup = editorDoc.createElement('div');
    colorGroup.className = 'erte-toolbar-group erte-color-group';
    colorGroup.append(makeColorControl('text'), makeColorControl('bg'));

    // Alignment: one icon dropdown whose trigger mirrors the active alignment.
    const alignDropdown = makeIconDropdown({
      title: 'Text alignment',
      triggerHtml: icons.alignLeft,
      triggerClass: 'erte-align-select',
    });
    alignIconRef.current = alignDropdown.icon;
    alignMenuRef.current = alignDropdown.menu;
    ALIGN_OPTIONS.forEach((option) => {
      alignDropdown.menu.appendChild(
        makeMenuItem({
          leadingHtml: icons[option.iconKey],
          label: option.label,
          data: { attr: 'data-align', value: option.key },
          onSelect: () => exec(option.cmd),
        }),
      );
    });

    // List split-button: main icon toggles the list on/off; the caret opens a
    // grid of marker styles. `styles` drives both the grid and active-marker sync.
    const makeListControl = (kind: 'ol' | 'ul') => {
      const isOrdered = kind === 'ol';
      const styles = isOrdered ? ORDERED_LIST_STYLES : BULLET_LIST_STYLES;
      const wrap = editorDoc.createElement('div');
      wrap.className = 'erte-select-wrap erte-split-wrap';

      const main = makeButton({
        icon: isOrdered ? icons.listOl : icons.listUl,
        title: isOrdered ? 'Numbered list' : 'Bulleted list',
        cmd: isOrdered ? 'insertOrderedList' : 'insertUnorderedList',
      });
      main.classList.add('erte-split-main');

      const caretBtn = editorDoc.createElement('button');
      caretBtn.type = 'button';
      caretBtn.className = 'erte-select erte-split-caret';
      caretBtn.title = isOrdered ? 'Numbered list styles' : 'Bullet list styles';
      caretBtn.setAttribute('aria-label', caretBtn.title);
      caretBtn.setAttribute('aria-haspopup', 'menu');
      caretBtn.setAttribute('aria-expanded', 'false');
      caretBtn.innerHTML = '<span class="erte-select-caret"></span>';
      caretBtn.addEventListener('mousedown', (event) => event.preventDefault());
      caretBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        saveSelection();
        const sel = editorDoc.getSelection();
        dropdownRangeRef.current =
          sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
        toggleDropdown(wrap);
      });

      const menu = editorDoc.createElement('div');
      menu.className = 'erte-select-menu erte-list-menu';
      menu.setAttribute('role', 'menu');

      const grid = editorDoc.createElement('div');
      grid.className = 'erte-list-grid';
      styles.forEach((style) => {
        const tile = editorDoc.createElement('button');
        tile.type = 'button';
        tile.className = 'erte-list-tile';
        tile.title = style.label;
        tile.setAttribute('aria-label', style.label);
        tile.dataset.listStyle = style.key;
        tile.innerHTML = style.markers
          .map(
            (marker) =>
              `<span class="erte-list-row"><span class="erte-list-marker">${marker}</span><span class="erte-list-bar"></span></span>`,
          )
          .join('');
        tile.addEventListener('mousedown', (event) => event.preventDefault());
        tile.addEventListener('click', (event) => {
          event.preventDefault();
          applyListStyle(kind, style.key, style.css);
          closeAllDropdowns();
        });
        grid.appendChild(tile);
      });
      menu.appendChild(grid);

      // Bullet lists get a "Custom bullet" row: any single character as marker.
      if (!isOrdered) {
        const customRow = editorDoc.createElement('div');
        customRow.className = 'erte-list-custom';
        const input = editorDoc.createElement('input');
        input.type = 'text';
        input.className = 'erte-list-custom-input';
        input.maxLength = 2;
        input.placeholder = '★';
        input.setAttribute('aria-label', 'Custom bullet character');
        const apply = editorDoc.createElement('button');
        apply.type = 'button';
        apply.className = 'erte-list-custom-apply';
        apply.textContent = 'Use bullet';
        apply.addEventListener('mousedown', (event) => event.preventDefault());
        apply.addEventListener('click', (event) => {
          event.preventDefault();
          const char = input.value.trim();
          if (!char) return;
          applyListStyle('ul', 'custom', `"${char}  "`);
          closeAllDropdowns();
        });
        customRow.append(input, apply);
        menu.appendChild(customRow);
      }

      caretBtn.addEventListener('keydown', () => undefined);
      wrap.append(main, caretBtn, menu);
      if (isOrdered) olMenuRef.current = menu;
      else ulMenuRef.current = menu;
      return wrap;
    };

    // Indent: one icon dropdown grouping increase / decrease / reset.
    const indentDropdown = makeIconDropdown({
      title: 'Indentation',
      triggerHtml: icons.indent,
      menuClass: 'erte-plain-menu',
    });
    [
      { icon: icons.indent, label: 'Increase indent', onSelect: () => exec('indent') },
      { icon: icons.outdent, label: 'Decrease indent', onSelect: () => exec('outdent') },
      { icon: icons.outdent, label: 'Reset indentation', onSelect: resetIndentation },
    ].forEach((entry) => {
      indentDropdown.menu.appendChild(
        makeMenuItem({ leadingHtml: entry.icon, label: entry.label, onSelect: entry.onSelect }),
      );
    });

    // "More" formatting menu: strikethrough, sub/superscript, horizontal rule,
    // and clear formatting — kept out of the main row to save space.
    const moreDropdown = makeIconDropdown({
      title: 'More formatting',
      triggerHtml: icons.ellipsis,
      menuClass: 'erte-plain-menu',
    });
    const registerMoreToggle = (item: HTMLButtonElement, cmd: string) => {
      item.setAttribute('aria-pressed', 'false');
      item.dataset.toggleCmd = cmd;
      toggleButtonsRef.current.push({ el: item, cmd });
    };
    const strikeItem = makeMenuItem({
      leadingHtml: icons.strikethrough,
      label: 'Strikethrough',
      onSelect: () => exec('strikeThrough'),
    });
    registerMoreToggle(strikeItem, 'strikeThrough');
    const subItem = makeMenuItem({
      leadingHtml: icons.subscript,
      label: 'Subscript',
      onSelect: () => exec('subscript'),
    });
    registerMoreToggle(subItem, 'subscript');
    const superItem = makeMenuItem({
      leadingHtml: icons.superscript,
      label: 'Superscript',
      onSelect: () => exec('superscript'),
    });
    registerMoreToggle(superItem, 'superscript');
    moreDropdown.menu.append(
      strikeItem,
      subItem,
      superItem,
      makeMenuItem({
        leadingHtml: icons.horizontalRule,
        label: 'Horizontal rule',
        onSelect: insertHorizontalRule,
      }),
      makeMenuItem({
        leadingHtml: icons.eraser,
        label: 'Clear formatting',
        onSelect: () => exec('removeFormat'),
      }),
    );

    // Link tool: anchored popover, not a modal. mousedown is prevented so the
    // editor selection survives the click that opens it.
    const linkButton = makeButton({
      icon: icons.link,
      title: 'Insert link',
      onClick: () => toggleLinkPopover(linkButton),
    });
    linkButton.addEventListener('mousedown', (event) => event.preventDefault());

    const groups: HTMLElement[][] = [
      [
        makeButton({ icon: icons.undo, title: 'Undo', cmd: 'undo' }),
        makeButton({ icon: icons.redo, title: 'Redo', cmd: 'redo' }),
      ],
      [
        makeButton({ icon: icons.bold, title: 'Bold', cmd: 'bold' }),
        makeButton({ icon: icons.italic, title: 'Italic', cmd: 'italic' }),
        makeButton({ icon: icons.underline, title: 'Underline', cmd: 'underline' }),
      ],
      [alignDropdown.wrap],
      [makeListControl('ol'), makeListControl('ul')],
      [indentDropdown.wrap],
      [moreDropdown.wrap],
      [linkButton, makeTablePicker()],
    ];

    // Final order: undo/redo | B I U | paragraph + font size | alignment |
    // lists | indent | more | link/table | colour tools.
    const iconGroups = groups.map(makeGroup);
    const orderedGroups: HTMLElement[] = [
      ...iconGroups.slice(0, 2), // undo/redo, bold/italic/underline
      blockGroup, // paragraph styles + block quote + code block
      styleGroup, // font size (− size +)
      ...iconGroups.slice(2), // alignment … link/table
      colorGroup,
    ];
    orderedGroups.forEach((group) => toolbar.appendChild(group));
    // Initial colour state: text = default black, highlight = none.
    updateColorIndicators();
    markSwatches(textColorMenuRef.current, currentTextColorRef.current);
    markSwatches(bgColorMenuRef.current, currentBgColorRef.current);
    // Hide the separator on whichever groups start a row (layout-dependent).
    updateToolbarRowStarts();

    if (showAiTools) {
      const aiGroup = editorDoc.createElement('div');
      aiGroup.className = 'erte-ai-group';

      const addAiBtn = (label: string, onClick: () => void) => {
        const btn = editorDoc.createElement('button');
        btn.type = 'button';
        btn.className = 'erte-ai-btn';
        btn.textContent = label;
        btn.onclick = (event) => {
          event.preventDefault();
          onClick();
        };
        aiGroup.appendChild(btn);
      };

      addAiBtn('Enhance', () => void runAiAction('enhance', null, null));
      addAiBtn('Proofread', () => void runAiAction('proofread', null, null));
      addAiBtn(
        'Expand',
        () => void runAiAction('expand', (t) => t.trim().split(/\s+/).length * 2, null),
      );
      addAiBtn(
        'Shorten',
        () =>
          void runAiAction(
            'shorten',
            (t) => Math.max(1, Math.floor(t.trim().split(/\s+/).length / 2)),
            null,
          ),
      );
      addAiBtn('Friendly', () => void runAiAction('changeTone', null, 'friendly'));
      addAiBtn('Formal', () => void runAiAction('changeTone', null, 'formal'));
      addAiBtn('Undo', () => exec('undo'));

      toolbar.appendChild(aiGroup);
    }

    syncToolbarState();
  };

  // --- Resize -----------------------------------------------------------

  // Drag an edge/corner to resize the container. Width/height are mutated
  // directly on the element during the drag (no re-renders / flicker) and
  // committed to state on release. Only dragged axes are committed, so an
  // untouched dimension keeps its responsive default. Left/top edges grow the
  // box with inverted deltas (the editor stays anchored in its layout).
  const startResize = (edges: ResizeEdges) => (event: ReactPointerEvent<HTMLSpanElement>) => {
    const container = containerRef.current;
    if (!container) return;
    event.preventDefault();

    const rect = container.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = rect.width;
    const startHeight = rect.height;
    const handleEl = event.currentTarget;
    const { pointerId } = event;

    // Pointer capture keeps events flowing to the handle even over the iframe.
    try {
      handleEl.setPointerCapture(pointerId);
    } catch {
      /* stale pointer id — safe to ignore */
    }

    container.classList.add('is-resizing');
    handleEl.classList.add('is-active');
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor =
      edges.h && edges.v
        ? (edges.h === 'left') === (edges.v === 'top')
          ? 'nwse-resize'
          : 'nesw-resize'
        : edges.h
          ? 'ew-resize'
          : 'ns-resize';
    document.body.style.userSelect = 'none';
    // Belt-and-suspenders so the iframe never swallows the drag.
    if (iframeRef.current) iframeRef.current.style.pointerEvents = 'none';

    // Available width = the parent's content box (clientWidth minus its own
    // padding), measured once at drag start. Matches the CSS `max-width: 100%`.
    const parentEl = container.parentElement;
    let maxAvailableWidth = startWidth;
    if (parentEl) {
      const parentStyle = parentEl.ownerDocument.defaultView?.getComputedStyle(parentEl);
      const parentPadding = parentStyle
        ? (parseFloat(parentStyle.paddingLeft) || 0) + (parseFloat(parentStyle.paddingRight) || 0)
        : 0;
      maxAvailableWidth = parentEl.clientWidth - parentPadding;
    }

    const handleMove = (moveEvent: PointerEvent) => {
      if (edges.h) {
        const dx = moveEvent.clientX - startX;
        const nextWidth = clampNumber(
          startWidth + (edges.h === 'right' ? dx : -dx),
          MIN_EDITOR_WIDTH,
          maxAvailableWidth,
        );
        container.style.width = `${nextWidth}px`;
      }
      if (edges.v) {
        const dy = moveEvent.clientY - startY;
        const nextHeight = clampNumber(
          startHeight + (edges.v === 'bottom' ? dy : -dy),
          MIN_EDITOR_HEIGHT,
          MAX_EDITOR_HEIGHT,
        );
        container.style.height = `${nextHeight}px`;
      }
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleEnd);
      window.removeEventListener('pointercancel', handleEnd);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      if (iframeRef.current) iframeRef.current.style.pointerEvents = '';
      container.classList.remove('is-resizing');
      handleEl.classList.remove('is-active');
      try {
        handleEl.releasePointerCapture(pointerId);
      } catch {
        /* already released — safe to ignore */
      }
      resizeCleanupRef.current = null;
    };

    const handleEnd = () => {
      // Commit only the dragged axes; keep the other dimension's default.
      setSize((prev) => ({
        width: edges.h ? Math.round(container.offsetWidth) : prev.width,
        height: edges.v ? Math.round(container.offsetHeight) : prev.height,
      }));
      cleanup();
    };

    resizeCleanupRef.current = cleanup;
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleEnd);
    window.addEventListener('pointercancel', handleEnd);
  };

  // --- Effects ----------------------------------------------------------

  // Inject the editable scaffold into the iframe once on mount.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) return;
    const iframeDoc = iframe.contentDocument;
    iframeDoc.open();
    iframeDoc.write(`
        <html>
          <head>
            <style>
              :root {
                --erte-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                --erte-text: #1a1a1a;
                --erte-toolbar-bg: #ffffff;
                --erte-border: #e6e6e6;
                --erte-icon: #5f6368;
                --erte-icon-hover: #1a1a1a;
                --erte-hover-bg: #f1f3f4;
                --erte-active-bg: #e8eaed;
                --erte-active-icon: #1a1a1a;
                --erte-accent: #d23f00;
                --erte-accent-hover: #b83700;
                --erte-radius: 8px;
              }
              * { box-sizing: border-box; }
              html, body { height: 100%; }
              /* Flex column: fixed toolbar row + scrollable content area.
                 The toolbar is OUTSIDE the scroll container, so it can never
                 scroll out of view — content scrolls underneath it. */
              body {
                margin: 0; font-family: var(--erte-font); font-weight: normal;
                color: var(--erte-text); background: #fff;
                display: flex; flex-direction: column; overflow: hidden;
              }

              .toolbar {
                position: relative; z-index: 10; flex: 0 0 auto;
                display: flex; align-items: center; flex-wrap: wrap; gap: 5px 15px;
                padding: 7px 10px;
                background: var(--erte-toolbar-bg);
                border-bottom: 1px solid var(--erte-border);
              }
              /* Group separators are drawn by each group in the gap to its
                 left (never standalone elements), so wrapping can't strand
                 one at a row edge. Groups that start a row get .erte-row-start
                 (computed from layout) which hides their separator. */
              .erte-toolbar-group { position: relative; }
              .erte-toolbar-group::before {
                content: ''; position: absolute; left: -8px; top: 50%;
                transform: translateY(-50%);
                width: 1px; height: 24px; background: #e5e7eb;
              }
              .erte-toolbar-group.erte-row-start::before { display: none; }

              .editor-scroll {
                position: relative; /* positioning context for table add-buttons */
                flex: 1 1 auto; min-height: 0; overflow: auto;
                scrollbar-width: thin; scrollbar-color: #c9cfd6 transparent;
              }
              .editor-scroll::-webkit-scrollbar { width: 12px; height: 12px; }
              .editor-scroll::-webkit-scrollbar-track { background: transparent; }
              .editor-scroll::-webkit-scrollbar-thumb {
                background: #c9cfd6; border-radius: 8px;
                border: 3px solid #fff; background-clip: padding-box;
              }
              .editor-scroll::-webkit-scrollbar-thumb:hover { background-color: #aab2bc; }
              .erte-toolbar-group { display: flex; align-items: center; gap: 2px; }
              .erte-ai-group { display: flex; align-items: center; gap: 6px; margin-left: auto; padding-left: 8px; flex-wrap: wrap; }

              .erte-btn {
                display: inline-flex; align-items: center; justify-content: center;
                width: 34px; height: 34px; padding: 0;
                border: none; background: transparent; border-radius: var(--erte-radius);
                color: var(--erte-icon); cursor: pointer;
                transition: background-color 0.15s ease, color 0.15s ease;
              }
              .erte-btn svg { display: block; width: 17px; height: 17px; }
              .erte-btn:hover { background: var(--erte-hover-bg); color: var(--erte-icon-hover); }
              .erte-btn:focus-visible { outline: 2px solid var(--erte-accent); outline-offset: 1px; }
              .erte-btn.is-active { background: var(--erte-active-bg); color: var(--erte-active-icon); }

              .erte-ai-btn {
                display: inline-flex; align-items: center; height: 32px; padding: 0 14px;
                border: 1px solid var(--erte-border); background: #fff; border-radius: 999px;
                color: #3c4043; font-family: var(--erte-font); font-size: 13px; font-weight: 500;
                cursor: pointer; white-space: nowrap;
                transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
              }
              .erte-ai-btn:hover { background: var(--erte-hover-bg); border-color: #d5d5d5; color: var(--erte-text); }
              .erte-ai-btn:focus-visible { outline: 2px solid var(--erte-accent); outline-offset: 1px; }

              /* Paragraph style + font-size controls */
              .erte-style-group { gap: 6px; }
              .erte-select-wrap { position: relative; display: inline-flex; }
              .erte-select {
                display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 10px;
                border: 1px solid var(--erte-border); background: #fff; border-radius: var(--erte-radius);
                color: var(--erte-text); font-family: var(--erte-font); font-size: 13px; line-height: 1;
                cursor: pointer; white-space: nowrap;
                transition: background-color 0.15s ease, border-color 0.15s ease;
              }
              .erte-select:hover { background: var(--erte-hover-bg); }
              .erte-select:focus-visible { outline: 2px solid var(--erte-accent); outline-offset: 1px; }
              /* Paragraph-style trigger: a clear text-styles icon + caret,
                 sized to sit alongside the Bold/Italic/Underline icons. */
              .erte-block-group { gap: 3px; }
              .erte-select--block { gap: 3px; padding: 0 6px 0 8px; }
              .erte-select-icon {
                display: inline-flex; align-items: center; justify-content: center;
                width: 20px; height: 20px; color: var(--erte-icon);
              }
              .erte-select-icon svg { display: block; width: 19px; height: 19px; }
              .erte-select--block:hover .erte-select-icon { color: var(--erte-icon-hover); }
              .erte-select--size { min-width: 60px; justify-content: center; }
              .erte-select-caret {
                width: 0; height: 0; margin-left: 2px;
                border-left: 4px solid transparent; border-right: 4px solid transparent;
                border-top: 5px solid var(--erte-icon);
              }

              /* Icon-triggered dropdowns (alignment, indent, more) */
              .erte-icon-select { gap: 3px; padding: 0 6px 0 8px; }
              .erte-icon-select-icon {
                display: inline-flex; align-items: center; justify-content: center;
                width: 17px; height: 17px; color: var(--erte-icon);
              }
              .erte-icon-select-icon svg { display: block; width: 17px; height: 17px; }

              /* Split-buttons (list styles): ONE shared rounded frame holding an
                 icon half (default action) and a caret half (opens the style
                 menu), split by a thin divider. The frame, border and base hover
                 live on the wrap so the two halves read as a single control —
                 matching the icon-dropdowns (alignment / indent / more). */
              .erte-split-wrap {
                display: inline-flex; align-items: stretch; height: 34px;
                border: 1px solid var(--erte-border); background: #fff;
                border-radius: var(--erte-radius);
                transition: background-color 0.15s ease, border-color 0.15s ease;
              }
              .erte-split-wrap:hover { background: var(--erte-hover-bg); }
              .erte-split-wrap:focus-within { border-color: #d0d0d0; }
              /* Halves are transparent and borderless; they inherit the wrap's
                 frame. height:auto lets them stretch to the frame's inner box,
                 and each keeps only its outer-edge radius. */
              .erte-split-wrap .erte-split-main {
                width: 30px; height: auto; border: none; background: transparent;
                border-radius: var(--erte-radius) 0 0 var(--erte-radius);
              }
              .erte-split-wrap .erte-split-caret {
                position: relative; width: 22px; min-width: 0; height: auto; padding: 0;
                border: none; background: transparent;
                border-radius: 0 var(--erte-radius) var(--erte-radius) 0;
                justify-content: center;
              }
              /* Thin divider between the icon and the caret. */
              .erte-split-caret::before {
                content: ''; position: absolute; left: 0; top: 50%;
                transform: translateY(-50%);
                width: 1px; height: 16px; background: var(--erte-border);
              }
              .erte-split-caret .erte-select-caret { margin-left: 0; }
              /* Per-half hover is a subtle tint layered over the frame hover, so
                 pointing at just the caret nudges that section a touch darker. */
              .erte-split-wrap .erte-split-main:hover,
              .erte-split-wrap .erte-split-caret:hover { background: rgba(60, 64, 67, 0.1); }
              /* List-on (aria-pressed) state stays visible inside the frame. */
              .erte-split-wrap .erte-split-main.is-active {
                background: var(--erte-active-bg); color: var(--erte-active-icon);
              }
              .erte-select-wrap.is-open .erte-select { background: var(--erte-hover-bg); border-color: #d0d0d0; }
              /* Open split-button: highlight the whole frame, not just the caret
                 (overrides the generic is-open rule above for this wrap). */
              .erte-split-wrap.is-open { background: var(--erte-hover-bg); border-color: #d0d0d0; }
              .erte-split-wrap.is-open .erte-split-caret { background: transparent; }
              .erte-select-menu {
                position: absolute; top: calc(100% + 4px); left: 0; z-index: 50;
                min-width: 100%; max-height: 280px; overflow-y: auto;
                padding: 6px; background: #fff; border: 1px solid var(--erte-border);
                border-radius: 10px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
                visibility: hidden; opacity: 0; transform: translateY(-4px); pointer-events: none;
                transition: opacity 0.12s ease, transform 0.12s ease, visibility 0.12s;
              }
              .erte-select-menu--size { min-width: 96px; }
              /* Paragraph styles: show all 8 options without scrolling. */
              .erte-select-menu--block { max-height: none; min-width: 168px; }
              .erte-select-wrap.is-open .erte-select-menu {
                visibility: visible; opacity: 1; transform: translateY(0); pointer-events: auto;
              }
              .erte-option {
                display: block; width: 100%; text-align: left; padding: 8px 12px;
                border: none; background: transparent; border-radius: 6px; cursor: pointer;
                color: var(--erte-text); font-family: var(--erte-font); font-size: 14px;
                line-height: 1.3; white-space: nowrap;
              }
              .erte-option:hover { background: var(--erte-hover-bg); }
              .erte-option.is-selected { background: var(--erte-accent); color: #fff; }
              .erte-option--h1 { font-size: 24px; font-weight: 700; }
              .erte-option--h2 { font-size: 20px; font-weight: 700; }
              .erte-option--h3 { font-size: 17px; font-weight: 700; }
              .erte-option--h4 { font-size: 15px; font-weight: 700; }
              .erte-option--h5 { font-size: 13px; font-weight: 700; }
              .erte-option--h6 { font-size: 12px; font-weight: 700; }
              .erte-option--pre { font-family: ui-monospace, 'Cascadia Code', Consolas, monospace; font-size: 13px; }
              .erte-step-btn { font-size: 18px; font-weight: 500; color: var(--erte-icon); }

              /* Generic menu rows (alignment, indent, more) */
              .erte-menu-item {
                display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 12px 8px 10px;
                border: none; background: transparent; border-radius: 6px; cursor: pointer;
                color: var(--erte-text); font-family: var(--erte-font); font-size: 13px;
                line-height: 1.2; white-space: nowrap; text-align: left;
              }
              .erte-menu-item:hover { background: var(--erte-hover-bg); }
              .erte-menu-item.is-selected { background: var(--erte-accent); color: #fff; }
              .erte-menu-item.is-selected .erte-menu-item-lead { color: #fff; }
              .erte-menu-item.is-active { background: var(--erte-active-bg); font-weight: 600; }
              .erte-menu-item-lead {
                display: inline-flex; align-items: center; justify-content: center;
                width: 16px; height: 16px; flex: 0 0 16px; color: var(--erte-icon);
              }
              .erte-menu-item-lead svg { display: block; width: 16px; height: 16px; }
              .erte-menu-item-label { flex: 1; }
              .erte-plain-menu { min-width: 190px; }

              /* List style picker (numbered + bullet marker grids) */
              .erte-list-menu { padding: 8px; min-width: 0; }
              .erte-list-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
              .erte-list-tile {
                display: flex; flex-direction: column; justify-content: center; gap: 4px;
                width: 62px; padding: 8px 8px; border: 1px solid var(--erte-border);
                background: #fff; border-radius: 8px; cursor: pointer;
                transition: border-color 0.12s ease, box-shadow 0.12s ease, background-color 0.12s ease;
              }
              .erte-list-tile:hover { background: var(--erte-hover-bg); border-color: #d0d0d0; }
              .erte-list-tile.is-selected {
                border-color: var(--erte-accent);
                box-shadow: inset 0 0 0 1px var(--erte-accent);
                background: rgba(210, 63, 0, 0.06);
              }
              .erte-list-row { display: flex; align-items: center; gap: 5px; }
              .erte-list-marker {
                flex: 0 0 18px; text-align: right; font-size: 10px; line-height: 1;
                color: #3c4043; font-family: var(--erte-font);
              }
              .erte-list-bar {
                flex: 1; height: 4px; border-radius: 2px; background: #d5dbe2;
              }
              .erte-list-tile.is-selected .erte-list-bar { background: #f0b49a; }
              .erte-list-custom {
                display: flex; align-items: center; gap: 6px; margin-top: 8px;
                padding-top: 8px; border-top: 1px solid var(--erte-border);
              }
              .erte-list-custom-input {
                width: 44px; height: 30px; padding: 0 8px; text-align: center;
                border: 1px solid var(--erte-border); border-radius: 6px;
                font-family: var(--erte-font); font-size: 14px;
              }
              .erte-list-custom-input:focus { outline: none; border-color: var(--erte-accent); }
              .erte-list-custom-apply {
                flex: 1; height: 30px; padding: 0 10px; border: 1px solid var(--erte-border);
                background: #fff; border-radius: 6px; cursor: pointer;
                font-family: var(--erte-font); font-size: 12px; font-weight: 500; color: #3c4043;
                transition: background-color 0.12s ease, border-color 0.12s ease;
              }
              .erte-list-custom-apply:hover { background: var(--erte-hover-bg); border-color: #d0d0d0; }

              /* Colour tools (text colour + highlight split buttons) */
              .erte-color-group { gap: 2px; }
              .erte-color-wrap { position: relative; }
              .erte-color-btn { width: 30px; position: relative; }
              .erte-color-glyph { font-size: 15px; font-weight: 700; line-height: 1; transform: translateY(-2px); }
              .erte-color-btn svg { transform: translateY(-2px); }
              .erte-color-bar {
                position: absolute; left: 6px; right: 6px; bottom: 5px; height: 3px;
                border-radius: 2px; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
              }
              /* "No colour" state: subtle neutral slot (never a colour swatch). */
              .erte-color-bar.is-transparent {
                background: #eceff2;
                box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
              }
              .erte-color-menu { left: auto; right: 0; padding: 8px; width: max-content; }
              .erte-color-remove, .erte-color-custom {
                display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 8px;
                border: none; background: transparent; border-radius: 6px; cursor: pointer;
                color: var(--erte-text); font-family: var(--erte-font); font-size: 13px;
              }
              .erte-color-remove:hover, .erte-color-custom:hover { background: var(--erte-hover-bg); }
              .erte-color-remove.is-selected { background: var(--erte-active-bg); font-weight: 600; }
              .erte-color-remove svg { width: 11px; height: 11px; }
              .erte-color-custom svg { width: 14px; height: 14px; }
              .erte-color-grid { display: grid; grid-template-columns: repeat(6, 22px); gap: 4px; padding: 8px 2px; }
              .erte-color-swatch {
                width: 22px; height: 22px; padding: 0; border: none; border-radius: 4px; cursor: pointer;
                box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12); transition: transform 0.1s ease;
              }
              .erte-color-swatch:hover { transform: scale(1.15); }
              .erte-color-swatch.is-selected,
              .erte-color-swatch:focus-visible,
              .erte-color-remove:focus-visible,
              .erte-color-custom:focus-visible { outline: 2px solid var(--erte-accent); outline-offset: 1px; }

              /* Custom colour picker modal */
              .erte-picker-backdrop { position: fixed; inset: 0; z-index: 10000; background: rgba(15, 23, 42, 0.18); }
              .erte-picker {
                position: absolute; top: 56px; left: 50%; transform: translateX(-50%);
                width: 400px; max-width: calc(100% - 32px);
                background: #fff; border: 1px solid var(--erte-border); border-radius: 12px;
                box-shadow: 0 18px 50px rgba(0, 0, 0, 0.22); padding: 16px;
                font-family: var(--erte-font); animation: erte-pop 0.14s ease;
              }
              @keyframes erte-pop {
                from { opacity: 0; transform: translateX(-50%) scale(0.97); }
                to { opacity: 1; transform: translateX(-50%) scale(1); }
              }
              .erte-picker-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
              .erte-picker-title { font-size: 14px; font-weight: 600; color: var(--erte-text); }
              .erte-picker-close {
                width: 26px; height: 26px; border: none; background: transparent; border-radius: 6px;
                font-size: 14px; color: var(--erte-icon); cursor: pointer;
              }
              .erte-picker-close:hover { background: var(--erte-hover-bg); }
              .erte-picker-body { display: flex; gap: 12px; }
              .erte-picker-sv {
                position: relative; width: 190px; height: 150px; border-radius: 8px;
                cursor: crosshair; touch-action: none; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
              }
              .erte-picker-sv-dot {
                position: absolute; width: 12px; height: 12px; border: 2px solid #fff; border-radius: 50%;
                box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4); transform: translate(-50%, -50%); pointer-events: none;
              }
              .erte-picker-hue {
                position: relative; width: 14px; height: 150px; border-radius: 7px; cursor: pointer; touch-action: none;
                background: linear-gradient(to bottom, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%);
              }
              .erte-picker-hue-thumb {
                position: absolute; left: -2px; right: -2px; height: 6px; border: 2px solid #fff; border-radius: 4px;
                box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4); transform: translateY(-50%); pointer-events: none;
              }
              .erte-picker-fields { display: flex; flex-direction: column; gap: 6px; flex: 1; }
              .erte-picker-field { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; color: var(--erte-icon); }
              .erte-picker-field input {
                flex: 1; width: 100%; height: 28px; padding: 0 8px;
                border: 1px solid var(--erte-border); border-radius: 6px;
                font-size: 13px; font-family: var(--erte-font);
              }
              .erte-picker-field input:focus { outline: none; border-color: var(--erte-accent); }
              .erte-picker-preview { margin-top: auto; height: 32px; border-radius: 8px; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.1); }
              .erte-picker-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }

              /* Table insert picker (hover grid) */
              .erte-table-menu { padding: 10px; }
              .erte-table-grid { display: grid; grid-template-columns: repeat(10, 16px); gap: 3px; }
              .erte-table-cell {
                width: 16px; height: 16px; padding: 0; border: none; border-radius: 4px;
                background: #f1f3f4; box-shadow: inset 0 0 0 1px #e3e6ea; cursor: pointer;
                transition: background-color 0.08s ease, box-shadow 0.08s ease;
              }
              .erte-table-cell.is-on {
                background: rgba(210, 63, 0, 0.14);
                box-shadow: inset 0 0 0 1px var(--erte-accent);
              }
              .erte-table-label { margin-top: 8px; text-align: center; font-size: 12px; color: #5f6368; }

              /* Floating add row/column buttons beside the hovered table */
              .erte-table-add {
                position: absolute; z-index: 20;
                display: flex; align-items: center; justify-content: center;
                padding: 0; border: none; border-radius: 7px;
                background: #eaf1f9; color: #0e4678;
                font-size: 13px; font-weight: 600; font-family: var(--erte-font); line-height: 1;
                cursor: pointer; opacity: 0; visibility: hidden;
                transition:
                  opacity 0.12s ease, background-color 0.12s ease, color 0.12s ease;
              }
              .erte-table-add.is-visible { opacity: 1; visibility: visible; }
              .erte-table-add:hover { background: #d6e5f4; color: #0b3860; }
              .erte-table-add:active { background: #0e4678; color: #ffffff; }

              .editor {
                padding: 24px 28px; min-height: 100%;
                border: none; outline: none;
                font-family: var(--erte-font); font-size: 16px; line-height: 1.7; color: var(--erte-text);
              }
              .editor a { color: var(--erte-accent); }
              .editor table { border-collapse: collapse; }
              /* Semantic block styles. Explicit px sizes + weights so a heading
                 always renders as a heading (independent of any inherited
                 font-size), matching modern editors. The block-style tool
                 strips exported inline font-size/weight so these can apply. */
              .editor h1 { font-size: 30px; font-weight: 700; line-height: 1.25; margin: 0.5em 0; }
              .editor h2 { font-size: 25px; font-weight: 700; line-height: 1.28; margin: 0.5em 0; }
              .editor h3 { font-size: 21px; font-weight: 700; line-height: 1.3; margin: 0.5em 0; }
              .editor h4 { font-size: 18px; font-weight: 700; line-height: 1.35; margin: 0.55em 0; }
              .editor h5 { font-size: 16px; font-weight: 700; line-height: 1.4; margin: 0.6em 0; }
              .editor h6 { font-size: 14px; font-weight: 700; line-height: 1.4; margin: 0.6em 0; text-transform: uppercase; letter-spacing: 0.03em; }
              .editor p { margin: 0.5em 0; }
              .editor pre {
                font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
                font-size: 13px; line-height: 1.5; white-space: pre-wrap; margin: 0.5em 0;
              }
              /* Legal (multi-level) numbering: "1.", "1.1", "1.1.1" via counters.
                 Inline list-style-type can't express this, so it's attribute-driven. */
              .editor ol[data-erte-list='legal'] { counter-reset: erte-legal; list-style: none; }
              .editor ol[data-erte-list='legal'] > li { counter-increment: erte-legal; }
              .editor ol[data-erte-list='legal'] > li::marker { content: counters(erte-legal, '.') '. '; }
              /* Custom bullet character (string list-style-type isn't universal). */
              .editor ul[data-erte-list='custom'] { list-style: none; }

              /* Floating link popover (anchored below the toolbar link button) */
              .erte-link-popover {
                position: fixed; z-index: 9000;
                width: min(420px, calc(100vw - 16px));
                background: #fff; border: 1px solid var(--erte-border);
                border-radius: 14px; padding: 5px 6px;
                box-shadow: 0 12px 32px rgba(0, 0, 0, 0.14), 0 2px 8px rgba(0, 0, 0, 0.06);
                font-family: var(--erte-font);
                opacity: 0; transform: translateY(-6px) scale(0.98);
                transition: opacity 0.16s ease, transform 0.16s ease;
              }
              .erte-link-popover.is-open { opacity: 1; transform: translateY(0) scale(1); }
              .erte-link-row { display: flex; align-items: center; gap: 2px; }
              .erte-link-input {
                flex: 1; min-width: 0; height: 34px; padding: 0 10px;
                border: none; outline: none; background: transparent;
                color: var(--erte-text); font-family: var(--erte-font); font-size: 14px;
              }
              .erte-link-input::placeholder { color: #9aa0a6; }
              .erte-link-popover.is-invalid .erte-link-input { color: #d93025; }
              .erte-link-btn {
                display: inline-flex; align-items: center; justify-content: center;
                flex: 0 0 auto; width: 32px; height: 32px; padding: 0;
                border: none; background: transparent; border-radius: 9px;
                color: var(--erte-icon); cursor: pointer;
                transition: background-color 0.15s ease, color 0.15s ease, opacity 0.15s ease;
              }
              .erte-link-btn svg { display: block; width: 16px; height: 16px; }
              .erte-link-btn:hover:not(:disabled) { background: var(--erte-hover-bg); color: var(--erte-icon-hover); }
              .erte-link-btn:active:not(:disabled) { background: var(--erte-active-bg); }
              .erte-link-btn:disabled { opacity: 0.35; cursor: default; }
              .erte-link-btn:focus-visible { outline: 2px solid var(--erte-accent); outline-offset: 1px; }
              .erte-link-sep { flex: 0 0 auto; width: 1px; height: 20px; margin: 0 4px; background: var(--erte-border); }
              .erte-link-error { padding: 2px 12px 7px; font-size: 12px; color: #d93025; }

              /* Shared action-button styles (used by the colour picker) */
              .erte-modal-btn {
                height: 36px; padding: 0 16px; border-radius: 8px;
                font-size: 13px; font-weight: 500; cursor: pointer; font-family: var(--erte-font);
                transition: background-color 0.15s ease, border-color 0.15s ease;
              }
              .erte-modal-insert { background: var(--erte-accent); border: 1px solid var(--erte-accent); color: #fff; }
              .erte-modal-insert:hover { background: var(--erte-accent-hover); border-color: var(--erte-accent-hover); }
              .erte-modal-cancel { background: #fff; border: 1px solid var(--erte-border); color: #3c4043; }
              .erte-modal-cancel:hover { background: var(--erte-hover-bg); }
            </style>
          </head>
          <body contenteditable="false">
            <div class="toolbar" id="toolbar"></div>
            <div class="editor-scroll" id="editor-scroll">
              <div class="editor" id="editor" contenteditable="true" spellcheck="true"></div>
            </div>
          </body>
        </html>
      `);
    iframeDoc.close();
    setDoc(iframeDoc);
  }, []);

  // Set initial content when the iframe document becomes ready.
  useEffect(() => {
    if (!doc) return;
    const editor = doc.getElementById('editor');
    if (!editor) return;
    editor.innerHTML = applySpellcheckIgnore(mailContent ?? '', spellcheckIgnoreWords);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  // Handle controlled updates (reset / product change / external edits).
  useEffect(() => {
    if (!doc || isInternalEdit.current) return;
    const editor = doc.getElementById('editor');
    if (!editor) return;
    const displayContent = applySpellcheckIgnore(mailContent ?? '', spellcheckIgnoreWords);
    if (editor.innerHTML !== displayContent) {
      editor.innerHTML = displayContent;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mailContent, resetMailContent]);

  // Propagate user edits back to the parent.
  useEffect(() => {
    if (!doc) return;
    const editor = doc.getElementById('editor');
    if (!editor) return;
    const handleInput = () => {
      isInternalEdit.current = true;
      setMailContent(editor.innerHTML);
      // Reset the flag slightly later so external updates can flow again.
      setTimeout(() => {
        isInternalEdit.current = false;
      }, 100);
    };
    editor.addEventListener('input', handleInput);
    return () => editor.removeEventListener('input', handleInput);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  // Close the link popover (its listeners + DOM) on unmount.
  useEffect(() => () => linkPopoverCloseRef.current?.(), []);

  // Re-sync content when the reset toggle changes.
  useEffect(() => {
    if (!doc) return;
    const editor = doc.getElementById('editor');
    if (!editor) return;
    editor.innerHTML = applySpellcheckIgnore(mailContent ?? '', spellcheckIgnoreWords);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetMailContent]);

  // (Re)build the toolbar when the iframe document is ready.
  useEffect(() => {
    renderToolbar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  // Interactive table tools: border drag-resize + floating add row/column
  // buttons. Returns its own cleanup (listeners + injected buttons).
  useEffect(() => {
    if (!doc) return;
    return initTableTools({ doc, onContentChange: propagateContent });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  // Refresh the toolbar state (toggles + paragraph/size) as the caret moves.
  useEffect(() => {
    if (!doc) return;
    const handler = () => syncToolbarState();
    doc.addEventListener('selectionchange', handler);
    return () => doc.removeEventListener('selectionchange', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  // Close any open toolbar dropdown on outside click or Escape.
  useEffect(() => {
    if (!doc) return;
    const closeAll = () => {
      doc.querySelectorAll<HTMLElement>('.erte-select-wrap.is-open').forEach((wrap) => {
        wrap.classList.remove('is-open');
        wrap.querySelector('.erte-select')?.setAttribute('aria-expanded', 'false');
      });
    };
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || !target.closest('.erte-select-wrap')) closeAll();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAll();
    };
    doc.addEventListener('mousedown', onMouseDown);
    doc.addEventListener('keydown', onKeyDown);
    return () => {
      doc.removeEventListener('mousedown', onMouseDown);
      doc.removeEventListener('keydown', onKeyDown);
    };
  }, [doc]);

  // Re-detect which groups start a toolbar row whenever the iframe resizes
  // (editor drag-resize or browser resize can change how the toolbar wraps).
  useEffect(() => {
    const win = doc?.defaultView;
    if (!win) return;
    const handler = () => updateToolbarRowStarts();
    win.addEventListener('resize', handler);
    return () => win.removeEventListener('resize', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  // Tear down any in-progress resize (window listeners + body styles) on unmount.
  useEffect(() => () => resizeCleanupRef.current?.(), []);

  return (
    <>
      {loading && <SpinnerLoader />}
      {/*
        Frame: the iframe fills the top grid row; the only VISIBLE resize
        element is the slim bottom bar (second row). All other resizing is
        native window-style: invisible 6px edge / 12px corner hit zones
        overlaid on the border (see RESIZE_ZONES).
      */}
      <div
        ref={containerRef}
        className="erte-resizable"
        style={{
          position: 'relative',
          boxSizing: 'border-box',
          display: 'grid',
          gridTemplateRows: 'minmax(0, 1fr) 8px',
          width: size.width != null ? `${size.width}px` : '100%',
          height: size.height != null ? `${size.height}px` : modalHeight || '650px',
          maxWidth: '100%',
          border: '1px solid #e6e6e6',
          borderRadius: '10px',
          background: '#fff',
          overflow: 'hidden',
        }}
      >
        <iframe
          ref={iframeRef}
          style={{
            gridRow: '1',
            display: 'block',
            width: '100%',
            height: '100%',
            border: 'none',
          }}
          title="iframe-editor"
        />
        <span
          className="erte-resize-handle erte-resize-handle--bottom"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize editor height"
          style={{
            gridRow: '2',
            position: 'relative',
            cursor: 'ns-resize',
            touchAction: 'none',
          }}
          onPointerDown={startResize({ h: null, v: 'bottom' })}
        />
        {RESIZE_ZONES.map((zone) => (
          <span
            key={zone.key}
            className="erte-resize-zone"
            role="separator"
            aria-label={zone.label}
            style={{
              position: 'absolute',
              zIndex: zone.edges.h && zone.edges.v ? 7 : 6,
              cursor: zone.cursor,
              touchAction: 'none',
              ...zone.placement,
            }}
            onPointerDown={startResize(zone.edges)}
          />
        ))}
      </div>
      <ErrorToaster message={toastErrorMessage} hidden={isErrorToastHidden} />
    </>
  );
}
