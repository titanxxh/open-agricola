import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('generated brand asset budgets', () => {
  it.each([
    { file: 'client/assets/brand-logo.png', size: 128, maxBytes: 40 * 1024 },
    { file: 'client/assets/favicon.png', size: 32, maxBytes: 4 * 1024 },
  ])('keeps $file at its display resolution and download budget', ({ file, size, maxBytes }) => {
    const image = readFileSync(file)
    expect([image.readUInt32BE(16), image.readUInt32BE(20)]).toEqual([size, size])
    expect(image.byteLength).toBeLessThanOrEqual(maxBytes)
  })
})
