export const createSeed = () => Math.floor(Math.random() * 1_000_000_000)

export const createRng = (seed: number) => {
  let value = seed
  return () => {
    value += 0x6d2b79f5
    let result = Math.imul(value ^ (value >>> 15), value | 1)
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61)
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

export const shuffleWithRng = (values: string[], rng: () => number) => {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1))
    const temp = result[index]
    result[index] = result[swapIndex]
    result[swapIndex] = temp
  }
  return result
}
