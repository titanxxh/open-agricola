import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import { setStoredResource } from '../../shared/cards/helpers/card-storage'
import { C120_AgriculturalLabourer_impl } from '../../shared/cards/C/C120_AgriculturalLabourer'
import type { DraftGameEvent } from '../../shared/contract/events'

import '../../shared/cards/C/C120_AgriculturalLabourer'

const CARD_ID = 'C120_AgriculturalLabourer'
const GAIN_LISTENER = C120_AgriculturalLabourer_impl.listeners.find((listener) => listener.id === 'C120-agricultural-labourer-after-gain')!

const moved = (
  overrides: Partial<DraftGameEvent<'resource.moved'>> = {},
): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { grain: 2 },
  from: { kind: 'supply' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'gain',
  ...overrides,
})

const directContext = (
  transactionEvents: CardListenerContext['transactionEvents'],
): CardListenerContext => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  const player = state.players[0]!
  player.id = 'p1'
  player.occupationPlayed.push(CARD_ID)
  setStoredResource(player, CARD_ID, 'clay', 8)
  return {
    state,
    player,
    space: state.actionSpaces.find((space) => space.id === 'day-laborer')!,
    actionId: 'gain',
    phase: 'after',
    transactionEvents,
    actionEvents: transactionEvents,
    result: { type: 'ok', resourcesGained: { grain: 2 } },
  } as unknown as CardListenerContext
}

describe('C120_AgriculturalLabourer session', () => {
  it('takes clay from the card for grain moved to the player even without result gains', () => {
    const ctx = directContext([moved()])
    ctx.result = { type: 'ok' }

    const result = executeCardListener(GAIN_LISTENER, ctx)

    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'take-from-card',
      params: { clay: 2 },
      sourceCard: CARD_ID,
    })
  })

  it('does not trigger for non-grain events even when result reports grain', () => {
    const ctx = directContext([moved({ resources: { wood: 2 } })])

    const result = executeCardListener(GAIN_LISTENER, ctx)

    expect(result).toBeUndefined()
  })

  it('does not trigger without a current grain event', () => {
    const ctx = directContext([])

    const result = executeCardListener(GAIN_LISTENER, ctx)

    expect(result).toBeUndefined()
  })

  it('takes clay from the card for grain gained through exchange events', () => {
    const ctx = directContext([])
    const player = ctx.player
    const event = {
      type: 'resource.exchanged',
      paid: { food: 1 },
      gained: { grain: 2 },
      paidFrom: { kind: 'player', playerId: player.id },
      paidTo: { kind: 'supply' },
      gainedFrom: { kind: 'supply' },
      gainedTo: { kind: 'player', playerId: player.id },
      exchangeSource: 'TestExchange',
      times: 1,
    } as any

    const result = GAIN_LISTENER.handler(directContext([event]))

    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'take-from-card',
      params: { clay: 2 },
      sourceCard: CARD_ID,
    })
  })
})
