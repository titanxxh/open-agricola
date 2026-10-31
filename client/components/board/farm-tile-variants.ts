export const tileVariant = (matrix: readonly (readonly number[])[], row: number, col: number): number => {
  const r = ((row % matrix.length) + matrix.length) % matrix.length
  const c = ((col % matrix[r].length) + matrix[r].length) % matrix[r].length
  return matrix[r][c] ?? 0
}
