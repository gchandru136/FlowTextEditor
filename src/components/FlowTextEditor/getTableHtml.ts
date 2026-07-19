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
  'vertical-align: top',
  'word-break: break-word',
  'overflow-wrap: break-word',
].join('; ');

/**
 * Build the inline HTML for an `rows` × `cols` table (used with
 * `execCommand('insertHTML', …)`).
 *
 * `table-layout: fixed` + an empty `<colgroup>` give every column an equal
 * width initially AND keep columns stable while typing (content wraps inside
 * its cell instead of reflowing neighbours). Manual column resizing writes px
 * widths onto the `<col>` elements, which fixed layout then treats as
 * proportions of the table width.
 */
export const getTableHtml = (rows: number, cols: number): string => `
  <table data-erte-table="true" style="width: calc(100% - ${TABLE_ACTION_SPACE}px); table-layout: fixed; border-collapse: collapse; font-weight: normal; font-family: sans-serif;">
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
