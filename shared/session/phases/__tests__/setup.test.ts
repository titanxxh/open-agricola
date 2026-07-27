import { describe, expect, it } from 'vitest'
import { SessionCardContext } from '../../../cards/session-card-context.ts'
import type { PlayerState } from '../../../contract/types.ts'
import { getCustomCardDefs, updatePlayerName } from '../setup.ts'

describe('setup phase helpers', () => {
  it('getCustomCardDefs returns [] for null context', () => {
    expect(getCustomCardDefs(null)).toEqual([])
  })

  it('getCustomCardDefs excludes executable custom-card fields', () => {
    const context = new SessionCardContext()
    context.registerCard({
      cardType: 'minor',
      cardJson: {
        id: 'CUSTOM_DisplayOnly',
        name: 'Display Only',
        deck: 'CUSTOM',
        number: 1,
        desc: ['Public metadata'],
        _code: 'secret source',
        _compiled: 'secret compiled',
      } as never,
    })

    expect(getCustomCardDefs(context)).toEqual([{
      cardType: 'minor',
      cardJson: {
        id: 'CUSTOM_DisplayOnly',
        name: 'Display Only',
        deck: 'CUSTOM',
        number: 1,
        desc: ['Public metadata'],
      },
      artUrl: null,
    }])
  })

  it('updatePlayerName trims and applies', () => {
    const player = { id: 'p0', name: 'old' } as unknown as PlayerState
    updatePlayerName(player, '  Alice  ')
    expect(player.name).toBe('Alice')
  })

  it('updatePlayerName ignores empty string', () => {
    const player = { id: 'p0', name: 'old' } as unknown as PlayerState
    updatePlayerName(player, '   ')
    expect(player.name).toBe('old')
  })

  it('updatePlayerName ignores undefined player', () => {
    expect(() => updatePlayerName(undefined, 'Alice')).not.toThrow()
  })
})
