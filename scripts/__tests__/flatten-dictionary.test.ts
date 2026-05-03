import { describe, it, expect } from 'vitest'
import { flattenDictionary } from '../i18n/flatten-dictionary'

describe('flattenDictionary', () => {
  it('flattens shallow keys', () => {
    const result = flattenDictionary({ a: 'x', b: 'y' })
    expect(result.get('a')).toBe('x')
    expect(result.get('b')).toBe('y')
    expect(result.size).toBe(2)
  })

  it('flattens nested objects with dot path', () => {
    const result = flattenDictionary({
      ui: { gameTitle: 'Open Agricola', round: 'Round' },
      actions: { 'bake-bread': { name: 'Bake' } },
    })
    expect(result.get('ui.gameTitle')).toBe('Open Agricola')
    expect(result.get('ui.round')).toBe('Round')
    expect(result.get('actions.bake-bread.name')).toBe('Bake')
    expect(result.size).toBe(3)
  })

  it('skips non-string leaves', () => {
    const result = flattenDictionary({ a: 1 as unknown as string, b: 'x' })
    expect(result.has('a')).toBe(false)
    expect(result.get('b')).toBe('x')
  })
})
