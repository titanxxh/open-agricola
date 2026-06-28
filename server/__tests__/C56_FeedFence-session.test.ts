import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getRegisteredCardListeners, executeCardListener } from '../../shared/cards/card-listeners'
import type { CardListenerContext } from '../../shared/cards/card-listeners'

import '../../shared/cards/C/C056_FeedFence'
import type { ActionFlow } from '../../shared/contract/types'

const CARD_ID = 'C056_FeedFence'

describe('C056_FeedFence session', () => {
  const runAfterStables = (configure: (player: import('../../shared/contract/types').PlayerState) => void) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.stableTiles = []
    configure(player)
    const space = state.actionSpaces.find((s) => s.id === 'farm-expansion')!
    session.loadState(state)

    const listener = getRegisteredCardListeners().find(
      (reg) => reg.id === 'C56-feed-fence-after-stables',
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

  it('grants the 4th-stable bonus when the 4th stable is the B85 FarmHand stable (card-facing count)', () => {
    // B85 already in use before this action; the snapshot baseline is the
    // card-facing count (2 ordinary + B85 = 3). Now 3 ordinary tiles
    // (1 built this action) + B85 -> card-facing count = 4 -> +2 food bonus
    // on top of 1 built = 3 food.
    const result = runAfterStables((player) => {
      player.stableTiles = [{ row: 2, col: 2 }, { row: 2, col: 3 }, { row: 2, col: 4 }]
      player.cardStates = {
        __actionSnapshot__: { extraData: { stableTiles: 3 } },
        B085_FarmHand: { extraData: { position: { row: 0, col: 0 } } },
      }
    })
    expect(result).toBeDefined()
    expect((result!.flow as Extract<ActionFlow, { type: 'leaf' }>).params?.food).toBe(3)
  })

  it('no bonus when card-facing count is 3 (only 1 built food)', () => {
    const result = runAfterStables((player) => {
      player.stableTiles = [{ row: 2, col: 2 }, { row: 2, col: 3 }, { row: 2, col: 4 }]
      player.cardStates = {
        __actionSnapshot__: { extraData: { stableTiles: 2 } },
      }
    })
    expect(result).toBeDefined()
    expect((result!.flow as Extract<ActionFlow, { type: 'leaf' }>).params?.food).toBe(1)
  })
})
