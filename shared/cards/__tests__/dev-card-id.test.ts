import { describe, expect, it } from 'vitest'
import { resolveDevCardIdInput } from '../dev-card-id'

describe('dev deck-number shorthand', () => {
  it('resolves a classic deck code and number to the classic card', () => {
    expect(resolveDevCardIdInput('CE203')).toBe('CE203_Shepherd')
    expect(resolveDevCardIdInput(' ci97 ')).toBe('CI097_Slaughterhouse')
  })

  it('keeps single-letter shorthand on the revised decks', () => {
    expect(resolveDevCardIdInput('C97')).toBe('C097_SeedResearcher')
    expect(resolveDevCardIdInput('e97')).toBe('E097_Beneficiary')
  })

  it('passes unknown classic numbers through unchanged', () => {
    expect(resolveDevCardIdInput('CE999')).toBe('CE999')
  })
})
