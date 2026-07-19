/**
 * Interactive table editing inside the editor iframe: drag column/row borders
 * to resize, and floating "+" buttons to append columns/rows (Notion-style).
 *
 * Everything is wired through a handful of delegated listeners on the scroll
 * container (cheap mousemove math, drag listeners only while dragging) and is
 * fully torn down by the returned cleanup function.
 */

import { TABLE_ACTION_SPACE } from './getTableHtml';

/** Distance (px) from a cell border that counts as the resize zone. */
const EDGE = 4;
const MIN_COL_WIDTH = 40;
const MIN_ROW_HEIGHT = 24;

/** Tables are sized to leave this much white room for the add controls. */
const TABLE_WIDTH_CSS = `calc(100% - ${TABLE_ACTION_SPACE}px)`;

interface TableToolsOptions {
  doc: Document;
  /** Called after any table mutation so the host can sync `mailContent`. */
  onContentChange: () => void;
}

interface ColZone {
  table: HTMLTableElement;
  /** Index of the column on the LEFT side of the dragged border. */
  leftIndex: number;
}

interface RowZone {
  row: HTMLTableRowElement;
}

const getCols = (table: HTMLTableElement): HTMLTableColElement[] =>
  Array.from(table.querySelectorAll<HTMLTableColElement>(':scope > colgroup > col'));

/**
 * Only CONTENT tables are interactive. Email templates are built from layout
 * tables marked `role="presentation"` — those must never grow resize handles
 * or add-buttons. Tables inserted by this editor carry `data-erte-table`;
 * legacy editor tables have no role attribute, so they stay interactive too.
 */
const isEditableTable = (table: HTMLTableElement): boolean =>
  table.dataset.erteTable === 'true' || table.getAttribute('role') !== 'presentation';

/**
 * Upgrade a table (including ones created before this feature) so it can be
 * resized: fixed layout + a `<colgroup>` whose `<col>`s carry px widths
 * matching the current rendered column widths.
 */
const ensureTableSetup = (doc: Document, table: HTMLTableElement): HTMLTableColElement[] => {
  const firstRow = table.rows[0];
  if (!firstRow) return [];

  let cols = getCols(table);
  if (cols.length !== firstRow.cells.length) {
    table.querySelector(':scope > colgroup')?.remove();
    const colgroup = doc.createElement('colgroup');
    cols = Array.from(firstRow.cells).map(() => doc.createElement('col'));
    cols.forEach((col) => colgroup.appendChild(col));
    table.insertBefore(colgroup, table.firstChild);
  }
  table.style.tableLayout = 'fixed';
  // Legacy / full-width tables get the reserved action space on first touch.
  if (!table.style.width || table.style.width === '100%') {
    table.style.width = TABLE_WIDTH_CSS;
  }
  return cols;
};

/** Write the current rendered column widths onto the `<col>` elements. */
const materializeColWidths = (table: HTMLTableElement, cols: HTMLTableColElement[]) => {
  const firstRow = table.rows[0];
  if (!firstRow) return;
  cols.forEach((col, index) => {
    const cell = firstRow.cells[index];
    if (cell) col.style.width = `${Math.round(cell.getBoundingClientRect().width)}px`;
  });
};

export function initTableTools({ doc, onContentChange }: TableToolsOptions): () => void {
  const editor = doc.getElementById('editor');
  const scroll = doc.getElementById('editor-scroll');
  if (!editor || !scroll) return () => undefined;

  // --- Floating add buttons (children of the scroll container) ------------

  const makeAddButton = (extraClass: string, title: string) => {
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = `erte-table-add ${extraClass}`;
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.textContent = '+';
    btn.setAttribute('contenteditable', 'false');
    scroll.appendChild(btn);
    return btn;
  };
  const addColBtn = makeAddButton('erte-table-add--col', 'Add column');
  const addRowBtn = makeAddButton('erte-table-add--row', 'Add row');

  const win = doc.defaultView ?? window;
  const HIDE_DELAY = 200;
  const ADD_BTN_SIZE = 16;

  // The active table is kept as long as the controls are showing, so a click
  // on "+" (which lands after the pointer has left the cells) still has a
  // table to act on. It is only cleared when the buttons actually hide.
  let activeTable: HTMLTableElement | null = null;
  let hideTimer: number | null = null;

  const cancelHide = () => {
    if (hideTimer !== null) {
      win.clearTimeout(hideTimer);
      hideTimer = null;
    }
  };

  const hideAddButtons = () => {
    cancelHide();
    addColBtn.classList.remove('is-visible');
    addRowBtn.classList.remove('is-visible');
    activeTable = null;
  };

  // Soft hide: the edge, the gap, and the "+" are one interactive region, so a
  // short grace period lets the pointer travel between them without the button
  // vanishing mid-move.
  const scheduleHide = () => {
    if (hideTimer !== null) return;
    hideTimer = win.setTimeout(() => {
      hideTimer = null;
      addColBtn.classList.remove('is-visible');
      addRowBtn.classList.remove('is-visible');
      activeTable = null;
    }, HIDE_DELAY);
  };

  // Moving onto a "+" button must keep it alive.
  addColBtn.addEventListener('mouseenter', cancelHide);
  addRowBtn.addEventListener('mouseenter', cancelHide);

  // Place each control in the table's reserved white action space — the column
  // "+" centered in the ~52px gap to the RIGHT of the table, the row "+" in the
  // gap BELOW it. The table no longer fills its container, so this space is the
  // editor's white content, never the surrounding page/email background.
  const GAP = 8;
  const positionAddButtons = (table: HTMLTableElement, showCol: boolean, showRow: boolean) => {
    const tRect = table.getBoundingClientRect();
    const sRect = scroll.getBoundingClientRect();
    const offsetLeft = tRect.left - sRect.left + scroll.scrollLeft;
    const offsetTop = tRect.top - sRect.top + scroll.scrollTop;

    if (showCol) {
      // Centre the button within the reserved action space, right of the table.
      const centred = offsetLeft + tRect.width + (TABLE_ACTION_SPACE - ADD_BTN_SIZE) / 2;
      // Defensive: never cross the scrollbar (only bites if the table is huge).
      const maxLeft = scroll.scrollLeft + scroll.clientWidth - ADD_BTN_SIZE - 6;
      addColBtn.style.left = `${Math.round(Math.min(centred, maxLeft))}px`;
      addColBtn.style.top = `${offsetTop}px`;
      addColBtn.style.width = `${ADD_BTN_SIZE}px`;
      addColBtn.style.height = `${tRect.height}px`;
    }
    addColBtn.classList.toggle('is-visible', showCol);

    if (showRow) {
      addRowBtn.style.left = `${offsetLeft}px`;
      addRowBtn.style.top = `${offsetTop + tRect.height + GAP}px`;
      addRowBtn.style.width = `${tRect.width}px`;
      addRowBtn.style.height = `${ADD_BTN_SIZE}px`;
    }
    addRowBtn.classList.toggle('is-visible', showRow);
  };

  // --- Mutations -----------------------------------------------------------

  const addColumn = () => {
    const table = activeTable;
    if (!table) return;
    const cols = ensureTableSetup(doc, table);
    materializeColWidths(table, cols);

    // Width the table currently occupies (== the available fit width, since
    // inserted tables are width:100%). Keep the table within this while space
    // allows; only overflow to horizontal scroll once columns hit the minimum.
    const fitWidth = table.getBoundingClientRect().width;
    const widths = cols.map((col) => parseFloat(col.style.width) || 0);
    const currentTotal = widths.reduce((a, b) => a + b, 0) || fitWidth;
    const newColCount = cols.length + 1;
    const idealNew = fitWidth / newColCount;

    const colgroup = table.querySelector(':scope > colgroup');
    const newCol = doc.createElement('col');
    colgroup?.appendChild(newCol);

    if (idealNew >= MIN_COL_WIDTH) {
      // Room to fit: shrink existing columns proportionally (preserving their
      // relative widths / manual sizing) so the table stays at its width.
      const scale = (fitWidth - idealNew) / currentTotal;
      cols.forEach((col, i) => {
        col.style.width = `${Math.round((widths[i] ?? 0) * scale)}px`;
      });
      newCol.style.width = `${Math.round(idealNew)}px`;
      table.style.width = TABLE_WIDTH_CSS;
    } else {
      // No room left: every column at the minimum, table overflows -> scroll.
      cols.forEach((col) => {
        col.style.width = `${MIN_COL_WIDTH}px`;
      });
      newCol.style.width = `${MIN_COL_WIDTH}px`;
      table.style.width = `${newColCount * MIN_COL_WIDTH}px`;
    }

    Array.from(table.rows).forEach((row) => {
      const last = row.cells[row.cells.length - 1];
      if (!last) return;
      const cell = last.cloneNode(false) as HTMLTableCellElement;
      cell.innerHTML = '&nbsp;';
      row.appendChild(cell);
    });

    positionAddButtons(table, true, addRowBtn.classList.contains('is-visible'));
    onContentChange();
  };

  const addRow = () => {
    const table = activeTable;
    if (!table) return;
    const lastRow = table.rows[table.rows.length - 1];
    if (!lastRow) return;
    const newRow = lastRow.cloneNode(false) as HTMLTableRowElement;
    newRow.style.height = ''; // don't inherit a manually resized height
    Array.from(lastRow.cells).forEach((cell) => {
      const clone = cell.cloneNode(false) as HTMLTableCellElement;
      clone.innerHTML = '&nbsp;';
      newRow.appendChild(clone);
    });
    lastRow.parentElement?.appendChild(newRow);
    positionAddButtons(table, addColBtn.classList.contains('is-visible'), true);
    onContentChange();
  };

  addColBtn.addEventListener('click', addColumn);
  addRowBtn.addEventListener('click', addRow);

  // --- Border hover detection ----------------------------------------------

  let colZone: ColZone | null = null;
  let rowZone: RowZone | null = null;
  let dragging = false;

  const clearHoverState = () => {
    colZone = null;
    rowZone = null;
    if (editor.style.cursor) editor.style.cursor = '';
  };

  const onMouseMove = (event: MouseEvent) => {
    if (dragging) return;
    const target = event.target as Element | null;
    // Over a "+" button (or the gap the timer is bridging): keep it alive.
    if (target === addColBtn || target === addRowBtn) {
      cancelHide();
      return;
    }
    const cell = target?.closest?.('td, th') as HTMLTableCellElement | null;
    const table = cell?.closest('table') as HTMLTableElement | null;
    if (!cell || !table || !editor.contains(table) || !isEditableTable(table)) {
      clearHoverState();
      // Soft hide — don't drop `activeTable` yet, so a click on a button the
      // pointer is travelling toward still works.
      scheduleHide();
      return;
    }
    cancelHide();

    const rect = cell.getBoundingClientRect();
    const row = cell.parentElement as HTMLTableRowElement;

    // Column border zones (interior borders only — table width is preserved).
    if (event.clientX >= rect.right - EDGE && cell.cellIndex < row.cells.length - 1) {
      colZone = { table, leftIndex: cell.cellIndex };
    } else if (event.clientX <= rect.left + EDGE && cell.cellIndex > 0) {
      colZone = { table, leftIndex: cell.cellIndex - 1 };
    } else {
      colZone = null;
    }

    // Row border zones (bottom edge of each row).
    if (event.clientY >= rect.bottom - EDGE) {
      rowZone = { row };
    } else if (event.clientY <= rect.top + EDGE && row.rowIndex > 0) {
      const prev = table.rows[row.rowIndex - 1];
      rowZone = prev ? { row: prev } : null;
    } else {
      rowZone = null;
    }

    editor.style.cursor = colZone ? 'ew-resize' : rowZone ? 'ns-resize' : '';

    // "+" buttons appear while hovering the last column / last row.
    activeTable = table;
    const isLastCol = cell.cellIndex === row.cells.length - 1;
    const isLastRow = row.rowIndex === table.rows.length - 1;
    if (isLastCol || isLastRow) positionAddButtons(table, isLastCol, isLastRow);
    else scheduleHide();
  };

  // --- Drag to resize --------------------------------------------------------

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    // Never treat a press on a "+" button as a border drag — let it click.
    const downTarget = event.target as Node | null;
    if (downTarget && (addColBtn.contains(downTarget) || addRowBtn.contains(downTarget))) return;
    if (!colZone && !rowZone) return;
    event.preventDefault(); // keep the caret/selection where it is
    dragging = true;
    cancelHide();
    hideAddButtons();

    const startX = event.clientX;
    const startY = event.clientY;

    let moveHandler: (e: PointerEvent) => void = () => undefined;

    if (colZone) {
      const { table, leftIndex } = colZone;
      const cols = ensureTableSetup(doc, table);
      materializeColWidths(table, cols);
      const leftCol = cols[leftIndex];
      const rightCol = cols[leftIndex + 1];
      const leftStart = leftCol ? parseFloat(leftCol.style.width) || 0 : 0;
      const rightStart = rightCol ? parseFloat(rightCol.style.width) || 0 : 0;
      const total = leftStart + rightStart;
      editor.style.cursor = 'ew-resize';

      moveHandler = (e: PointerEvent) => {
        if (!leftCol || !rightCol) return;
        const dx = e.clientX - startX;
        const left = Math.min(Math.max(leftStart + dx, MIN_COL_WIDTH), total - MIN_COL_WIDTH);
        leftCol.style.width = `${Math.round(left)}px`;
        rightCol.style.width = `${Math.round(total - left)}px`;
      };
    } else if (rowZone) {
      const { row } = rowZone;
      const startHeight = row.getBoundingClientRect().height;
      editor.style.cursor = 'ns-resize';

      moveHandler = (e: PointerEvent) => {
        const dy = e.clientY - startY;
        row.style.height = `${Math.round(Math.max(MIN_ROW_HEIGHT, startHeight + dy))}px`;
      };
    }

    const endHandler = () => {
      doc.removeEventListener('pointermove', moveHandler);
      doc.removeEventListener('pointerup', endHandler);
      doc.removeEventListener('pointercancel', endHandler);
      dragging = false;
      clearHoverState();
      onContentChange();
    };

    doc.addEventListener('pointermove', moveHandler);
    doc.addEventListener('pointerup', endHandler);
    doc.addEventListener('pointercancel', endHandler);
  };

  // Repositioning on scroll would lag; just hide until the next hover.
  const onScroll = () => hideAddButtons();

  // Pointer left the editor area entirely (toolbar, page, …) — hide, but with
  // the grace delay so grazing the boundary near a "+" doesn't kill it.
  const onMouseLeave = () => {
    if (dragging) return;
    clearHoverState();
    scheduleHide();
  };

  scroll.addEventListener('mousemove', onMouseMove);
  scroll.addEventListener('mouseleave', onMouseLeave);
  scroll.addEventListener('pointerdown', onPointerDown, true);
  scroll.addEventListener('scroll', onScroll, { passive: true });

  return () => {
    cancelHide();
    scroll.removeEventListener('mousemove', onMouseMove);
    scroll.removeEventListener('mouseleave', onMouseLeave);
    scroll.removeEventListener('pointerdown', onPointerDown, true);
    scroll.removeEventListener('scroll', onScroll);
    addColBtn.remove();
    addRowBtn.remove();
  };
}
