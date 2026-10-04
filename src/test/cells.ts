/**
 * One editor cell, named by the FIELD it writes rather than by where it sits.
 *
 * Addressing cells by DOM position — `screen.getAllByRole('textbox')[n]` — is what made 017
 * risky: the two inputs in a row swapped places, and every ordinal call site in the suite
 * quietly came to mean the other column, including the ones that went on passing. `data-cell`
 * names the field, and the field is the thing a test has an opinion about.
 *
 * `querySelectorAll` returns document order, but filtered to ONE field the n-th match is the
 * n-th row whichever way round the inputs are drawn. That is the whole property being bought
 * here, and the reason this must not be "simplified" back to indexing every textbox.
 */
export function cell(row: number, field: 'col1' | 'col2'): HTMLInputElement {
  const all = [...document.querySelectorAll<HTMLInputElement>(`[data-cell="${field}"]`)]
  const found = all[row]
  if (!found) throw new Error(`no ${field} cell in row ${row + 1}`)
  return found
}
