import { clampByte, hexToRgb, hsvToRgb, rgbToHex, rgbToHsv } from './color';
import type { HsvColor } from './color';

export interface ColorPickerOptions {
  /** The iframe document the picker is rendered into. */
  doc: Document;
  /** Initial colour as a hex string. */
  initialColor: string;
  title?: string;
  onSave: (hex: string) => void;
  onCancel?: () => void;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Imperative custom colour picker modal rendered inside the editor iframe:
 * saturation/value gradient, hue slider, RGB + HEX inputs, live preview.
 * Returns a function that force-closes the picker.
 */
export function openColorPicker(options: ColorPickerOptions): () => void {
  const { doc } = options;
  let hsv: HsvColor = rgbToHsv(hexToRgb(options.initialColor) ?? { r: 0, g: 0, b: 0 });

  const backdrop = doc.createElement('div');
  backdrop.className = 'erte-picker-backdrop';
  backdrop.innerHTML = `
    <div class="erte-picker" role="dialog" aria-modal="true" aria-label="Colour picker">
      <div class="erte-picker-header">
        <span class="erte-picker-title">${options.title ?? 'Color Picker'}</span>
        <button type="button" class="erte-picker-close" aria-label="Close">&#10005;</button>
      </div>
      <div class="erte-picker-body">
        <div class="erte-picker-sv"><div class="erte-picker-sv-dot"></div></div>
        <div class="erte-picker-hue"><div class="erte-picker-hue-thumb"></div></div>
        <div class="erte-picker-fields">
          <label class="erte-picker-field">R<input data-channel="r" type="number" min="0" max="255" /></label>
          <label class="erte-picker-field">G<input data-channel="g" type="number" min="0" max="255" /></label>
          <label class="erte-picker-field">B<input data-channel="b" type="number" min="0" max="255" /></label>
          <label class="erte-picker-field">#<input data-hex type="text" maxlength="7" spellcheck="false" /></label>
          <div class="erte-picker-preview" aria-hidden="true"></div>
        </div>
      </div>
      <div class="erte-picker-actions">
        <button type="button" class="erte-modal-btn erte-modal-cancel" data-cancel>Cancel</button>
        <button type="button" class="erte-modal-btn erte-modal-insert" data-save>Save</button>
      </div>
    </div>`;

  const svEl = backdrop.querySelector<HTMLElement>('.erte-picker-sv');
  const svDot = backdrop.querySelector<HTMLElement>('.erte-picker-sv-dot');
  const hueEl = backdrop.querySelector<HTMLElement>('.erte-picker-hue');
  const hueThumb = backdrop.querySelector<HTMLElement>('.erte-picker-hue-thumb');
  const rInput = backdrop.querySelector<HTMLInputElement>('input[data-channel="r"]');
  const gInput = backdrop.querySelector<HTMLInputElement>('input[data-channel="g"]');
  const bInput = backdrop.querySelector<HTMLInputElement>('input[data-channel="b"]');
  const hexInput = backdrop.querySelector<HTMLInputElement>('input[data-hex]');
  const preview = backdrop.querySelector<HTMLElement>('.erte-picker-preview');
  const saveBtn = backdrop.querySelector<HTMLButtonElement>('[data-save]');
  const cancelBtn = backdrop.querySelector<HTMLButtonElement>('[data-cancel]');
  const closeBtn = backdrop.querySelector<HTMLButtonElement>('.erte-picker-close');

  if (
    !svEl ||
    !svDot ||
    !hueEl ||
    !hueThumb ||
    !rInput ||
    !gInput ||
    !bInput ||
    !hexInput ||
    !preview ||
    !saveBtn ||
    !cancelBtn ||
    !closeBtn
  ) {
    return () => undefined;
  }

  const close = () => {
    doc.removeEventListener('keydown', onKeyDown, true);
    backdrop.remove();
  };

  const cancel = () => {
    options.onCancel?.();
    close();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      cancel();
    }
  };

  /** Re-render every control from `hsv`, skipping the input being typed in. */
  const render = (except?: HTMLElement) => {
    const rgb = hsvToRgb(hsv);
    const hex = rgbToHex(rgb);
    svEl.style.background =
      `linear-gradient(to top, #000, rgba(0, 0, 0, 0)), ` +
      `linear-gradient(to right, #fff, rgba(255, 255, 255, 0)), ` +
      `hsl(${Math.round(hsv.h)}, 100%, 50%)`;
    svDot.style.left = `${hsv.s * 100}%`;
    svDot.style.top = `${(1 - hsv.v) * 100}%`;
    hueThumb.style.top = `${(hsv.h / 360) * 100}%`;
    preview.style.background = hex;
    if (rInput !== except) rInput.value = String(rgb.r);
    if (gInput !== except) gInput.value = String(rgb.g);
    if (bInput !== except) bInput.value = String(rgb.b);
    if (hexInput !== except) hexInput.value = hex;
  };

  /** Shared press-and-drag plumbing (pointer capture keeps the drag smooth). */
  const bindDrag = (el: HTMLElement, update: (event: PointerEvent) => void) => {
    el.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      try {
        el.setPointerCapture(event.pointerId);
      } catch {
        /* stale pointer id — safe to ignore */
      }
      update(event);
      const move = (moveEvent: PointerEvent) => update(moveEvent);
      const end = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', end);
        el.removeEventListener('pointercancel', end);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    });
  };

  bindDrag(svEl, (event) => {
    const rect = svEl.getBoundingClientRect();
    hsv = {
      h: hsv.h,
      s: clamp01((event.clientX - rect.left) / rect.width),
      v: 1 - clamp01((event.clientY - rect.top) / rect.height),
    };
    render();
  });

  bindDrag(hueEl, (event) => {
    const rect = hueEl.getBoundingClientRect();
    hsv = { ...hsv, h: clamp01((event.clientY - rect.top) / rect.height) * 360 };
    render();
  });

  [rInput, gInput, bInput].forEach((input) => {
    input.addEventListener('input', () => {
      hsv = rgbToHsv({
        r: clampByte(Number(rInput.value)),
        g: clampByte(Number(gInput.value)),
        b: clampByte(Number(bInput.value)),
      });
      render(input);
    });
  });

  hexInput.addEventListener('input', () => {
    const rgb = hexToRgb(hexInput.value);
    if (!rgb) return; // keep typing until the value is a valid hex colour
    hsv = rgbToHsv(rgb);
    render(hexInput);
  });

  saveBtn.addEventListener('click', (event) => {
    event.preventDefault();
    options.onSave(rgbToHex(hsvToRgb(hsv)));
    close();
  });
  cancelBtn.addEventListener('click', (event) => {
    event.preventDefault();
    cancel();
  });
  closeBtn.addEventListener('click', (event) => {
    event.preventDefault();
    cancel();
  });
  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) cancel();
  });

  doc.addEventListener('keydown', onKeyDown, true);
  doc.body.appendChild(backdrop);
  render();
  hexInput.focus();
  hexInput.select();

  return close;
}
