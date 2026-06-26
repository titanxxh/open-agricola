import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readPngHeader = (path: string) => {
  const data = readFileSync(path)
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    colorType: data.readUInt8(25),
  }
}

describe('Farmers of the Moor horse icon asset', () => {
  it('uses the transparent horse icon extracted from the rulebook components list', () => {
    expect(readPngHeader('public/assets/moor/icons/horse.png')).toEqual({
      width: 140,
      height: 110,
      colorType: 6,
    })
  })
})
