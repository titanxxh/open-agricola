import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getRegisteredCardListeners, executeCardListener } from '../../shared/cards/card-listeners'
import type { CardListenerContext } from '../../shared/cards/card-listeners'

import '../../shared/cards/D/D168_Stockman'
import type { ActionFlow } from '../../shared/contract/types'

const CARD_ID = 'D168_Stockman'

describe('D168_Stockman session', () => {
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
      (reg) => reg.id === 'D168-stockman-after-stables',
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
    // Ordinary before = 0, now 1 ordinary tile built this action, plus the
    // B85 FarmHand stable already in use -> card-facing nAfter = 2, so the
    // newly built tile is the 2nd stable -> gains 1 cattle.
    const result = runAfterStables((player) => {
      player.stableTiles = [{ row: 2, col: 2 }]
      player.cardStates = {
        __actionSnapshot__: { extraData: { stableTiles: 0 } },
        B85_FarmHand: { extraData: { position: { row: 0, col: 0 } } },
      }
    })
    expect(result).toBeDefined()
    expect((result!.flow as Extract<ActionFlow, { type: 'leaf' }>).params?.cattle).toBe(1)
  })

  it('does not fire when the built stable is only the 1st card-facing stable', () => {
    const result = runAfterStables((player) => {
      player.stableTiles = [{ row: 2, col: 2 }]
      player.cardStates = {
        __actionSnapshot__: { extraData: { stableTiles: 0 } },
      }
    })
    expect(result).toBeUndefined()
  })
})
