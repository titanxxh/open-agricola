import { describe, expect, it } from 'vitest'
import './setup-register-all'
import { getCardDefinition } from '../catalog'

describe('getCardDefinition', () => {
  it('returns occupation definition by id', () => {
    const def = getCardDefinition('A93_BedMaker')
    expect(def?.id).toBe('A93_BedMaker')
    expect(def?.name).toBeDefined()
  })

  it('returns minor improvement definition by id', () => {
    const def = getCardDefinition('A28_ForestSchool')
    expect(def?.id).toBe('A28_ForestSchool')
    expect(def?.name).toBeDefined()
  })

  it('returns major card definition with metadata fields', () => {
    const def = getCardDefinition('Major_Fireplace1')
    expect(def?.id).toBe('Major_Fireplace1')
    expect(def?.isCookery).toBe(true)
    expect(def?.exchanges?.length ?? 0).toBeGreaterThan(0)
    expect(def?.vp).toBe(1)
  })

  it('returns undefined for unknown id', () => {
    expect(getCardDefinition('Unknown_Card_999')).toBeUndefined()
  })
})
