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

  it('uses the transparent fuel icon extracted from the rulebook components list', () => {
    expect(readPngHeader('public/assets/moor/icons/fuel.png')).toEqual({
      width: 96,
      height: 96,
      colorType: 6,
    })
  })

  it('uses the transparent Farmers of the Moor major deck icon asset', () => {
    expect(readPngHeader('public/assets/moor/icons/major-deck-m.png')).toEqual({
      width: 96,
      height: 96,
      colorType: 6,
    })
  })

  it('uses the transparent 5+ player badge extracted from the five-six player card scans', () => {
    expect(readPngHeader('public/assets/player56/players-5-plus.png')).toEqual({
      width: 72,
      height: 72,
      colorType: 6,
    })
  })
})
