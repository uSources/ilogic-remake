/** Las piezas de las tablas de Markdown de los informes, una sola vez para que todos se escriban igual. */

/** Una fila de una tabla de Markdown. */
export const tableRow = (cells: readonly (string | number)[]): string => `| ${cells.join(' | ')} |`;

/** La cabecera de una tabla de Markdown: los nombres y cada columna a la izquierda o, con `right`, a la derecha. */
export const tableHead = (headers: readonly string[], right: readonly boolean[]): string[] => [
  tableRow(headers),
  `|${right.map((alignedRight) => (alignedRight ? '---:' : '---')).join('|')}|`,
];

/** Un numero que puede faltar: con su formato, o una raya. */
export const orDash = (value: number | null, format: (value: number) => string): string => (value === null ? '—' : format(value));

/** Una fila de una comparacion: antes, despues y el cambio (vacio si falta uno de los dos). */
export function comparisonRow(label: string, before: number | null, after: number | null, format: (value: number) => string): string {
  const change = before !== null && after !== null ? after - before : null;
  return tableRow([label, orDash(before, format), orDash(after, format), change === null ? '' : (change > 0 ? '+' : '') + format(change)]);
}
