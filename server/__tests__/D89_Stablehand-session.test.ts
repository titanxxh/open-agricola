import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { executeCardListener, getRegisteredCardListeners, type CardListenerContext } from '../../shared/cards/card-listeners'
import type { DraftGameEvent } from '../../shared/contract/events'

import '../../shared/cards/D/D89_Stablehand'

const CARD_ID = 'D89_Stablehand'

const fenceBuilt = (
  newPastures: Array<{ tiles?: unknown[] }>,
): DraftGameEvent<'farm.fenceBuilt'> => ({
  type: 'farm.fenceBuilt',
  fences: [{ edge: 'H-0-0', type: 'fence' }],
  newFenceEdges: ['H-0-0'],
  newPastures,
})

const setup = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  const player = state.players[0]!
  player.occupationPlayed.push(CARD_ID)
  const listener = getRegisteredCardListeners().find((entry) => entry.id === 'D89-stablehand-after-fencing')
  expect(listener).toBeDefined()
  return { state, player, listener: listener! }
}

describe('D89_Stablehand fence provenance', () => {
  it('offers one optional stable after a new pasture fence event', () => {
    const { state, player, listener } = setup()
    const actionEvents = [fenceBuilt([{ tiles: [{ row: 0, col: 0 }] }])]

    const result = executeCardListener(listener, {
      state,
      player,
      space: state.actionSpaces.find((entry) => entry.id === 'fencing')!,
      actionId: 'fence',
      phase: 'after',
      result: { type: 'ok' },
      transactionEvents: actionEvents,
      actionEvents,
    } as unknown as CardListenerContext)

    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'stables',
      optional: true,
      sourceCard: CARD_ID,
      actionContext: { max: 1, exactCost: { max: 1 }, trueAction: false },
    })
  })

  it('ignores legacy newPastures extraData when fence event has no new pasture', () => {
    const { state, player, listener } = setup()
    const actionEvents = [fenceBuilt([])]

    const result = executeCardListener(listener, {
      state,
      player,
      space: state.actionSpaces.find((entry) => entry.id === 'fencing')!,
      actionId: 'fence',
      phase: 'after',
      result: { type: 'ok', extraData: { newPastures: [{ tiles: [{ row: 0, col: 0 }] }] } },
      transactionEvents: actionEvents,
      actionEvents,
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })
})
