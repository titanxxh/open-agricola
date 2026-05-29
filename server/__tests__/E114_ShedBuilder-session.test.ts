import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getRegisteredCardListeners, executeCardListener } from '../../shared/cards/card-listeners'
import type { CardListenerContext } from '../../shared/cards/card-listeners'

import '../../shared/cards/E/E114_ShedBuilder'
import type { ActionFlow } from '../../shared/contract/types'

const CARD_ID = 'E114_ShedBuilder'

describe('E114_ShedBuilder session', () => {
  const runAfterStables = (configure: (player: import('../../shared/contract/types').PlayerState) => void) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.stableTiles = []
    configure(player)
    const space = state.actionSpaces.find((s) => s.id === 'farm-expansion')!
    session.loadState(state)

    const listener = getRegisteredCardListeners().find(
      (reg) => reg.id === 'E114-shed-builder-after-stables',
    )!
    const context: CardListenerContext = {
      state,
      player,
      space,
      actionId: 'stables',
      phase: 'after',
      result: { type: 'ok' },
    }
    return executeCardListener(listener, context)
  }

  it('counts the B85 FarmHand stable when locating the ordinal stable (card-facing count)', () => {
    // Ordinary before = 1, now 2 ordinary tiles (1 built this action), plus the
    // B85 FarmHand stable -> card-facing nAfter = 3, so the newly built tile is
    // the 3rd stable -> gains 1 vegetable (not grain).
    const result = runAfterStables((player) => {
      player.stableTiles = [{ row: 2, col: 2 }, { row: 2, col: 3 }]
      player.cardStates = {
        __actionSnapshot__: { extraData: { stableTiles: 1 } },
        B85_FarmHand: { extraData: { position: { row: 0, col: 0 } } },
      }
    })
    expect(result).toBeDefined()
    const params = (result!.flow as Extract<ActionFlow, { type: 'leaf' }>).params
    expect(params?.vegetable).toBe(1)
    expect(params?.grain).toBeUndefined()
  })

  it('gains grain for the 2nd ordinary stable without B85', () => {
    const result = runAfterStables((player) => {
      player.stableTiles = [{ row: 2, col: 2 }, { row: 2, col: 3 }]
      player.cardStates = {
        __actionSnapshot__: { extraData: { stableTiles: 1 } },
      }
    })
    expect(result).toBeDefined()
    const params = (result!.flow as Extract<ActionFlow, { type: 'leaf' }>).params
    expect(params?.grain).toBe(1)
    expect(params?.vegetable).toBeUndefined()
  })
})
