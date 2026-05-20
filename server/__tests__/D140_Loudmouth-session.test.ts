import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import { D140_Loudmouth_impl } from '../../shared/cards/D/D140_Loudmouth'
import type { DraftGameEvent } from '../../shared/contract/events'
import type { Resource } from '../../shared/contract/types'

import '../../shared/cards/D/D140_Loudmouth'

const CARD_ID = 'D140_Loudmouth'
const LISTENER = D140_Loudmouth_impl.listeners[0]!

const moved = (
  resources: Partial<Resource>,
  from: DraftGameEvent<'resource.moved'>['from'] = { kind: 'actionSpace', spaceId: 'forest' },
): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources,
  from,
  to: { kind: 'player', playerId: 'p1' },
  reason: from.kind === 'actionSpace' ? 'collect' : 'cardEffect',
})

const directContext = (
  transactionEvents: DraftGameEvent<'resource.moved'>[],
): CardListenerContext => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  const player = state.players[0]!
  player.id = 'p1'
  player.occupationPlayed.push(CARD_ID)
  return {
    state,
    player,
    space: state.actionSpaces.find((space) => space.id === 'forest')!,
    actionId: 'collect',
    phase: 'after',
    transactionEvents,
    actionEvents: transactionEvents,
    result: { type: 'ok', resourcesGained: { wood: 4 } },
  } as unknown as CardListenerContext
}

describe('D140_Loudmouth session', () => {
  it('grants food for 4+ building resources from an action space without result gains', () => {
    const ctx = directContext([moved({ wood: 4 })])
    ctx.result = { type: 'ok' }

    const result = executeCardListener(LISTENER, ctx)

    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'gain',
      params: { food: 1 },
      sourceCard: CARD_ID,
    })
  })

  it('grants food for 4+ animals from an action space without result gains', () => {
    const ctx = directContext([moved({ sheep: 4 }, { kind: 'actionSpace', spaceId: 'sheep-market' })])
    ctx.result = { type: 'ok' }

    const result = executeCardListener(LISTENER, ctx)

    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'gain',
      params: { food: 1 },
      sourceCard: CARD_ID,
    })
  })

  it('does not trigger below threshold', () => {
    const ctx = directContext([moved({ wood: 3 })])

    const result = executeCardListener(LISTENER, ctx)

    expect(result).toBeUndefined()
  })

  it('does not trigger for supply/cardEffect resources even when result reports threshold', () => {
    const ctx = directContext([moved({ wood: 4 }, { kind: 'supply' })])

    const result = executeCardListener(LISTENER, ctx)

    expect(result).toBeUndefined()
  })
})
