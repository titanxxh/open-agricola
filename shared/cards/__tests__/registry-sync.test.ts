import { describe, expect, it } from 'vitest'
import './setup-register-all'
import { CardRegistry } from '../registry'
import { A28_ForestSchool } from '../A/A28_ForestSchool'
import { A123_FrameBuilder } from '../A/A123_FrameBuilder'

describe('CardRegistry modifier loading', () => {
  it('loads a single modifier from Card Source impl', () => {
    const registry = new CardRegistry()
    registry.loadImpl(A28_ForestSchool.id, A28_ForestSchool.impl)
    const mods = registry.getModifiers('A28_ForestSchool')
    expect(mods).toHaveLength(1)
    expect(mods[0]?.type).toBe('trade')
  })

  it('loads plural modifiers from Card Source impl', () => {
    const registry = new CardRegistry()
    registry.loadImpl(A123_FrameBuilder.id, A123_FrameBuilder.impl)
    const mods = registry.getModifiers('A123_FrameBuilder')
    expect(mods.length).toBeGreaterThan(0)
  })

  it('syncModifiersFromCatalog is a compatibility no-op', () => {
    const registry = new CardRegistry()
    registry.syncModifiersFromCatalog([], [])
    expect(registry.getModifiers('A28_ForestSchool')).toEqual([])
  })
})
