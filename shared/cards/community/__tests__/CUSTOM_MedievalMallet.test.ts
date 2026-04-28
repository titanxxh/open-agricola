import { describe, it, expect } from 'vitest'
import { CUSTOM_MedievalMallet, CUSTOM_MedievalMallet_impl } from '../CUSTOM_MedievalMallet'

describe('CUSTOM_MedievalMallet — community card smoke test', () => {
  it('exports a valid definition', () => {
    expect(CUSTOM_MedievalMallet).toBeDefined()
    expect(CUSTOM_MedievalMallet.id).toBe('CUSTOM_MedievalMallet')
    expect(CUSTOM_MedievalMallet.name).toBeTruthy()
    expect(CUSTOM_MedievalMallet.deck).toBe('community')
  })

  it('exports a CardImpl', () => {
    expect(CUSTOM_MedievalMallet_impl).toBeDefined()
    const hasBehavior =
      !!CUSTOM_MedievalMallet_impl.effect ||
      (CUSTOM_MedievalMallet_impl.listeners?.length ?? 0) > 0 ||
      (CUSTOM_MedievalMallet_impl.modifiers?.length ?? 0) > 0 ||
      (CUSTOM_MedievalMallet.vp ?? 0) > 0
    expect(hasBehavior).toBe(true)
  })
})
