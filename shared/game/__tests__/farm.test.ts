import { describe, expect, it } from 'vitest'
import { isBorderEdge } from '../../domain/farm'

describe('isBorderEdge', () => {
  it('treats top/bottom rows as horizontal border', () => {
    expect(isBorderEdge('H-0-0')).toBe(true)
    expect(isBorderEdge('H-0-4')).toBe(true)
    expect(isBorderEdge('H-3-0')).toBe(true)
    expect(isBorderEdge('H-3-4')).toBe(true)
  })
  it('rejects internal horizontal edges', () => {
    expect(isBorderEdge('H-1-2')).toBe(false)
    expect(isBorderEdge('H-2-0')).toBe(false)
  })
  it('treats leftmost/rightmost columns as vertical border', () => {
    expect(isBorderEdge('V-0-0')).toBe(true)
    expect(isBorderEdge('V-2-0')).toBe(true)
    expect(isBorderEdge('V-0-5')).toBe(true)
    expect(isBorderEdge('V-2-5')).toBe(true)
  })
  it('rejects internal vertical edges', () => {
    expect(isBorderEdge('V-1-3')).toBe(false)
    expect(isBorderEdge('V-0-1')).toBe(false)
  })
  it('rejects malformed ids', () => {
    expect(isBorderEdge('')).toBe(false)
    expect(isBorderEdge('X-0-0')).toBe(false)
    expect(isBorderEdge('H-0')).toBe(false)
    expect(isBorderEdge('garbage')).toBe(false)
  })
})
