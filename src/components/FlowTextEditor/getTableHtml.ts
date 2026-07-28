/**
 * Reserved white "action space" (px) kept to the right of / below every table
 * so the floating add-column / add-row controls have their own room and never
 * sit on the surrounding page background. The table occupies the rest.
 */
export const TABLE_ACTION_SPACE = 52;

const CELL_STYLE = [
  'padding: 8px 10px',
  'border: 1px solid #d7dce2',
  'font-weight: normal',
  'font-family: sans-serif',
  'font-size: 14px',
  'vertical-align: top',
  'word-break: break-word',
  'overflow-wrap: break-word',
].join('; ');

/**
 * Build the inline HTML for a `rows` × `cols` table (used with
 * `execCommand('insertHTML', …)`).
 *
 * Includes explicit `cellpadding="0" cellspacing="0" border="0"` and
 * `border-collapse: collapse; border-spacing: 0;` for 100% email client
 * compatibility (Gmail, Outlook, Apple Mail, Yahoo Mail).
 */
export const getTableHtml = (rows: number, cols: number): string => `
  <table data-erte-table="true" cellpadding="0" cellspacing="0" border="0" style="width: calc(100% - ${TABLE_ACTION_SPACE}px); table-layout: fixed; border-collapse: collapse; border-spacing: 0; font-weight: normal; font-family: sans-serif; margin: 0.8em 0;">
    <colgroup>${Array.from({ length: cols })
      .map(() => '<col>')
      .join('')}</colgroup>
    <tbody>
      ${Array.from({ length: rows })
        .map(
          () => `
        <tr>
          ${Array.from({ length: cols })
            .map(() => `<td style="${CELL_STYLE}">&nbsp;</td>`)
            .join('')}
        </tr>
      `,
        )
        .join('')}
    </tbody>
  </table>
  <p><br></p>
`;
