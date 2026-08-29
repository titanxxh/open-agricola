import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { executeCardListener, getRegisteredCardListeners, type CardListenerContext } from '../../shared/cards/card-listeners'
import type { DraftGameEvent } from '../../shared/contract/events'

import '../../shared/cards/D/D089_Stablehand'

const CARD_ID = 'D089_Stablehand'

const fenceBuilt = (
  newPastures: Array<{ tiles?: unknown[] }>,
  type: 'fence' | 'palisade' = 'fence',
): DraftGameEvent<'farm.fenceBuilt'> => ({
  type: 'farm.fenceBuilt',
  fences: [{ edge: 'H-0-0', type }],
  newFenceEdges: type === 'fence' ? ['H-0-0'] : [],
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

describe('D089_Stablehand fence provenance', () => {
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

  it('offers one optional stable after building an ordinary fence without a new pasture', () => {
    const { state, player, listener } = setup()
    const actionEvents = [fenceBuilt([])]

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
    })
  })

  it('ignores Wood Palisades even when they enclose a new pasture', () => {
    const { state, player, listener } = setup()
    const actionEvents = [fenceBuilt([{ tiles: [{ row: 0, col: 0 }] }], 'palisade')]

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

    expect(result).toBeUndefined()
  })
})
