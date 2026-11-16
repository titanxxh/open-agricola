import { expect, it, vi } from 'vitest'
import { GameCore } from '../session-core'

const cards = ['CUSTOM_First', 'CUSTOM_Second'].map(id => ({ cardType: 'minor' as const, cardJson: { id, name: id, deck: 'CUSTOM', number: 0, desc: [] } }))
const register = (card: typeof cards[number]) => { if (card.cardJson.id === 'CUSTOM_Second') throw new Error('Registration fixture failure') }

it('rejects the complete custom selection when strict registration fails and preserves the default warning policy', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    expect(() => new GameCore({ stateOrSeed: 42, customCards: cards, registerCustomCardImpl: register, customCardRegistration: 'strict' })).toThrow('Failed to register card CUSTOM_Second: Registration fixture failure')
    const ordinary = new GameCore({ stateOrSeed: 42, customCards: cards, registerCustomCardImpl: register })
    try {
      expect(ordinary.getState().ok).toBe(true)
      expect(ordinary.cardWarnings).toEqual(['Failed to register card CUSTOM_Second: Registration fixture failure'])
    } finally { ordinary.dispose() }
    const clean = new GameCore({ stateOrSeed: 42, initialStateOptions: { playerCount: 2 } })
    try { expect(clean.getState().state.players.flatMap(player => player.minorHand)).not.toContain('CUSTOM_First') }
    finally { clean.dispose() }
  } finally { warn.mockRestore() }
})
