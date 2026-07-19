import { icons } from './icons';

/** Why the popover closed — lets the caller decide whether to refocus the editor. */
export type LinkPopoverCloseReason = 'apply' | 'remove' | 'escape' | 'outside' | 'programmatic';

export interface LinkPopoverOptions {
  /** The iframe document the popover is rendered into. */
  doc: Document;
  /** Toolbar link button the popover is anchored below. */
  anchor: HTMLElement;
  /** Pre-filled URL when the selection is on an existing link ('' otherwise). */
  initialUrl: string;
  /** Whether the selection is on an existing link (enables Remove). */
  hasLink: boolean;
  /** Receives the normalized URL. Insertion/update is the caller's job. */
  onApply: (url: string) => void;
  onRemove: () => void;
  onClose?: (reason: LinkPopoverCloseReason) => void;
}

export interface LinkValidation {
  valid: boolean;
  /** URL to actually insert/open (a default scheme may be added, e.g. https://). */
  normalized: string;
}

/**
 * Lightweight URL validation for the link popover. Accepts http(s), mailto,
 * tel and relative URLs; bare domains and email addresses are normalized to
 * https:// and mailto: respectively. Everything else (including javascript:)
 * is rejected.
 */
export const validateLinkUrl = (raw: string): LinkValidation => {
  const value = raw.trim();
  if (!value) return { valid: false, normalized: '' };
  if (/^https?:\/\//i.test(value)) {
    return { valid: /^https?:\/\/\S+$/i.test(value), normalized: value };
  }
  if (/^mailto:/i.test(value)) {
    return { valid: /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value), normalized: value };
  }
  if (/^tel:/i.test(value)) {
    return { valid: /^tel:\+?[\d\s().-]{3,}$/.test(value), normalized: value };
  }
  // Relative URLs (/path, ./path, ../path, #hash, ?query).
  if (/^(\/|\.\/|\.\.\/|#|\?)\S*$/.test(value)) {
    return { valid: true, normalized: value };
  }
  // Bare email address -> mailto:.
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return { valid: true, normalized: `mailto:${value}` };
  }
  // Bare domain (google.com, example.org/path) -> https://.
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#]\S*)?$/i.test(value)) {
    return { valid: true, normalized: `https://${value}` };
  }
  return { valid: false, normalized: value };
};

const CLOSE_ANIMATION_MS = 160;

/**
 * Imperative floating link popover rendered inside the editor iframe, anchored
 * below the toolbar link button: URL input plus apply / open / remove actions.
 * Returns a function that force-closes the popover.
 */
export function openLinkPopover(options: LinkPopoverOptions): () => void {
  const { doc, anchor } = options;
  const win = doc.defaultView;

  const popover = doc.createElement('div');
  popover.className = 'erte-link-popover';
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', options.hasLink ? 'Edit link' : 'Insert link');
  popover.innerHTML = `
    <div class="erte-link-row">
      <input class="erte-link-input" type="text" placeholder="Paste a link..."
        spellcheck="false" autocomplete="off" aria-label="Link URL" />
      <button type="button" class="erte-link-btn" data-apply title="Apply link" aria-label="Apply link">${icons.linkApply}</button>
      <span class="erte-link-sep" aria-hidden="true"></span>
      <button type="button" class="erte-link-btn" data-open title="Open link in new tab" aria-label="Open link in new tab">${icons.linkOpen}</button>
      <button type="button" class="erte-link-btn" data-remove title="Remove link" aria-label="Remove link">${icons.linkRemove}</button>
    </div>
    <div class="erte-link-error" role="alert" hidden>Enter a valid URL (https://, mailto:, tel: or a relative path).</div>`;

  const input = popover.querySelector<HTMLInputElement>('.erte-link-input');
  const applyBtn = popover.querySelector<HTMLButtonElement>('[data-apply]');
  const openBtn = popover.querySelector<HTMLButtonElement>('[data-open]');
  const removeBtn = popover.querySelector<HTMLButtonElement>('[data-remove]');
  const errorEl = popover.querySelector<HTMLElement>('.erte-link-error');

  if (!input || !applyBtn || !openBtn || !removeBtn || !errorEl || !win) {
    return () => undefined;
  }

  // Clicks in the parent page are also "outside" — the iframe can't see them.
  let parentDoc: Document | null = null;
  try {
    parentDoc = win.frameElement?.ownerDocument ?? null;
  } catch {
    parentDoc = null; // cross-origin parent — same-document handling still works
  }

  let closed = false;
  const close = (reason: LinkPopoverCloseReason) => {
    if (closed) return;
    closed = true;
    doc.removeEventListener('mousedown', onDocMouseDown, true);
    doc.removeEventListener('keydown', onDocKeyDown, true);
    parentDoc?.removeEventListener('mousedown', onParentMouseDown, true);
    popover.classList.remove('is-open');
    win.setTimeout(() => popover.remove(), CLOSE_ANIMATION_MS);
    options.onClose?.(reason);
  };

  const onDocMouseDown = (event: MouseEvent) => {
    const target = event.target as Node | null;
    if (target && (popover.contains(target) || anchor.contains(target))) return;
    close('outside');
  };
  const onParentMouseDown = () => close('outside');
  const onDocKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close('escape');
    }
  };

  // Reflect validity on the action buttons and the (subtle) error line.
  const update = () => {
    const { valid } = validateLinkUrl(input.value);
    const isEmpty = input.value.trim() === '';
    applyBtn.disabled = !valid;
    openBtn.disabled = !valid;
    removeBtn.disabled = !options.hasLink;
    const showError = !isEmpty && !valid;
    errorEl.hidden = !showError;
    popover.classList.toggle('is-invalid', showError);
  };

  const apply = () => {
    const { valid, normalized } = validateLinkUrl(input.value);
    if (!valid) return;
    options.onApply(normalized);
    close('apply');
  };

  input.addEventListener('input', update);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      apply();
    }
  });

  // Keep focus in the input while clicking the action buttons.
  [applyBtn, openBtn, removeBtn].forEach((btn) =>
    btn.addEventListener('mousedown', (event) => event.preventDefault()),
  );
  applyBtn.addEventListener('click', apply);
  openBtn.addEventListener('click', () => {
    const { valid, normalized } = validateLinkUrl(input.value);
    if (valid) win.open(normalized, '_blank', 'noopener,noreferrer');
  });
  removeBtn.addEventListener('click', () => {
    options.onRemove();
    close('remove');
  });

  // Cycle Tab / Shift+Tab between the input and the enabled action buttons.
  popover.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const focusables: HTMLElement[] = [input, applyBtn, openBtn, removeBtn].filter(
      (el) => !(el instanceof HTMLButtonElement) || !el.disabled,
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && doc.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && doc.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  doc.body.appendChild(popover);

  // Anchor below the toolbar button, clamped inside the iframe viewport.
  // position: fixed is stable here — the toolbar never scrolls.
  const anchorRect = anchor.getBoundingClientRect();
  const margin = 8;
  const maxLeft = doc.documentElement.clientWidth - popover.offsetWidth - margin;
  popover.style.top = `${Math.round(anchorRect.bottom + margin)}px`;
  popover.style.left = `${Math.round(Math.min(Math.max(anchorRect.left, margin), Math.max(margin, maxLeft)))}px`;

  input.value = options.initialUrl;
  update();
  input.focus();
  if (options.initialUrl) input.select();

  doc.addEventListener('mousedown', onDocMouseDown, true);
  doc.addEventListener('keydown', onDocKeyDown, true);
  parentDoc?.addEventListener('mousedown', onParentMouseDown, true);

  // Double rAF so the initial (hidden) style is committed before animating in.
  win.requestAnimationFrame(() => {
    win.requestAnimationFrame(() => popover.classList.add('is-open'));
  });

  return () => close('programmatic');
}
