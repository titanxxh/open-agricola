import { describe, it, expect } from 'vitest'
import { CUSTOM_MasterBuilder, CUSTOM_MasterBuilder_impl } from '../CUSTOM_MasterBuilder'

describe('CUSTOM_MasterBuilder — community card smoke test', () => {
  it('exports a valid definition', () => {
    expect(CUSTOM_MasterBuilder).toBeDefined()
    expect(CUSTOM_MasterBuilder.id).toBe('CUSTOM_MasterBuilder')
    expect(CUSTOM_MasterBuilder.name).toBeTruthy()
    expect(CUSTOM_MasterBuilder.deck).toBe('community')
  })

  it('exports a CardImpl', () => {
    expect(CUSTOM_MasterBuilder_impl).toBeDefined()
    const hasBehavior =
      !!CUSTOM_MasterBuilder_impl.effect ||
      (CUSTOM_MasterBuilder_impl.listeners?.length ?? 0) > 0 ||
      (CUSTOM_MasterBuilder_impl.modifiers?.length ?? 0) > 0 ||
      (CUSTOM_MasterBuilder.vp ?? 0) > 0
    expect(hasBehavior).toBe(true)
  })
})
