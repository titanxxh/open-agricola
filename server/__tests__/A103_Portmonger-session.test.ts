import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { CardListenerContext } from '../../shared/cards/card-listeners'
import type { DraftGameEvent } from '../../shared/contract/events'
import { A103_Portmonger_impl } from '../../shared/cards/A/A103_Portmonger'

import '../../shared/cards/A/A103_Portmonger'

const CARD_ID = 'A103_Portmonger'

const setup = (fishingFood: number) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0

  const player = state.players[0]!
  player.occupationPlayed.push(CARD_ID)
  player.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
  state.players[1]!.minorHand = ['__test_placeholder__']
  state.players[1]!.occupationHand = ['__test_placeholder__']

  const fishing = state.actionSpaces.find((space) => space.id === 'fishing')
  if (!fishing) throw new Error('fishing space missing')
  fishing.resources.food = fishingFood

  session.loadState(state)
  return session
}

const supplyCardEffectFood = (food: number): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { food },
  from: { kind: 'supply' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'cardEffect',
})

const runListener = (
  transactionEvents: DraftGameEvent[],
  resourcesGained: { food?: number },
) => A103_Portmonger_impl.listeners![0]!.handler({
  state: { players: [{ id: 'p1', occupationPlayed: [CARD_ID] }] },
  player: { id: 'p1' },
  space: { id: 'fishing', gainPerRound: { food: 1 } },
  actionId: 'collect',
  phase: 'after',
  transactionEvents,
  result: { type: 'ok', resourcesGained },
} as unknown as CardListenerContext)

describe('A103_Portmonger session', () => {
  it.each([
    { food: 1, gain: { vegetable: 1 } },
    { food: 2, gain: { grain: 1 } },
    { food: 3, gain: { reed: 1 } },
  ])('maps $food action-space food to $gain', ({ food, gain }) => {
    const session = setup(food)
    const foodBefore = session.getState().state.players[0]!.resources.food

    const resp = session.takeAction(0, 'fishing')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(foodBefore + food)
    expect(resp.state.players[0]!.resources).toMatchObject(gain)
  })
})

describe('A103_Portmonger listener provenance guard', () => {
  it('ignores generic supply/cardEffect food even when result reports food gained', () => {
    const result = runListener([supplyCardEffectFood(3)], { food: 3 })

    expect(result).toBeUndefined()
  })
})
