/** Remove binary floating-point tails without discarding fractional card scores. */
export const formatScore = (value: number, showPositiveSign = false): string => {
  const rounded = Number(value.toFixed(10))
  return `${showPositiveSign && rounded > 0 ? '+' : ''}${rounded}`
}
