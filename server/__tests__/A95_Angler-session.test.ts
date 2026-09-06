import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { CardListenerContext } from '../../shared/cards/card-listeners'
import type { DraftGameEvent } from '../../shared/contract/events'
import { A095_Angler_impl } from '../../shared/cards/A/A095_Angler'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/A/A095_Angler'
import '../../shared/cards/A/A031_DebtSecurity'

const CARD_ID = 'A095_Angler'
const TEST_MINOR = 'A006_StorageBarn'

const setup = (fishingFood: number, actor = 0, withMinor = true) => {
  const session = new GameSession(5095, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 14
  state.roundPhase = 'work'

  const player = state.players[0]!
  state.players.forEach((candidate) => {
    candidate.minorHand = ['__test_placeholder__']
    candidate.occupationHand = ['__test_placeholder__']
    candidate.resources.food = 0
    setWorkersAtHome(state, candidate, 2)
  })
  player.occupationPlayed = [CARD_ID]
  player.minorHand = withMinor ? ['A031_DebtSecurity'] : [TEST_MINOR]
  player.resources.food = withMinor ? 2 : 0

  const fishing = state.actionSpaces.find((space) => space.id === 'fishing')
  if (!fishing) throw new Error('fishing space missing')
  fishing.resources.food = fishingFood

  session.loadState(state)
  return session
}

const playOccupationSession = () => {
  const session = new GameSession(5096, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    setWorkersAtHome(state, player, 2)
  })
  state.players[0]!.occupationHand = [CARD_ID]
  state.players[0]!.resources.food = 0
  session.loadState(state)
  return session.takeAction(0, 'lessons')
}

const resolveAnglerMinor = (session: GameSession) => {
  let response = resolveTriggerIfPresent(session, session.takeAction(0, 'fishing'), CARD_ID)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const accept = response.interaction.request.options?.find((option) => option.value !== '__skip__')
  expect(accept).toBeDefined()
  response = session.resolveChoice(response.interaction.playerIndex, accept!.value)
  if (response.interaction.stateId === 'wait') {
    const improvement = response.interaction.request.options?.find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  }
  if (response.interaction.stateId === 'wait') {
    const card = response.interaction.request.options?.find((option) => option.value === 'A031_DebtSecurity')
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  }
  return response
}

const supplyCardEffectFood = (food: number): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { food },
  from: { kind: 'supply' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'cardEffect',
})

const fishingFood = (food: number): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { food },
  from: { kind: 'actionSpace', spaceId: 'fishing' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'collect',
})

const runListener = (
  transactionEvents: DraftGameEvent[],
  resourcesGained: { food?: number },
  actionEvents?: DraftGameEvent[],
) => A095_Angler_impl.listeners![0]!.handler({
  state: { players: [{ id: 'p1', occupationPlayed: [CARD_ID] }] },
  player: { id: 'p1' },
  space: { id: 'fishing', gainPerRound: { food: 1 } },
  actionId: 'collect',
  phase: 'after',
  transactionEvents,
  actionEvents,
  result: { type: 'ok', resourcesGained },
} as unknown as CardListenerContext)

describe('A095_Angler session', () => {
  it('A095 S1: Angler is played as the first occupation without paying food', () => {
    const response = playOccupationSession()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it.each([['S2a', 1], ['S2b', 2]] as const)(
    'A095 %s: collecting %i food from Fishing allows a Major or Minor Improvement',
    (_scenario, fishingFood) => {
      const session = setup(fishingFood)
      const response = resolveAnglerMinor(session)

      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.minorPlayed).toContain('A031_DebtSecurity')
      expect(response.state.players[0]!.resources.food).toBe(fishingFood)
    },
  )

  it('A095 S3: the optional improvement after Fishing can be declined', () => {
    const session = setup(2)
    const foodBefore = session.getState().state.players[0]!.resources.food

    let resp = resolveTriggerIfPresent(session, session.takeAction(0, 'fishing'), CARD_ID)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId === 'wait') {
      resp = session.resolveChoice(resp.interaction.playerIndex, '__skip__')
    }

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(foodBefore + 2)
    expect(resp.state.players[0]!.minorHand).toContain('A031_DebtSecurity')
  })

  it('A095 S4: collecting more than two food from Fishing offers no improvement', () => {
    const session = setup(3)
    const foodBefore = session.getState().state.players[0]!.resources.food

    const resp = session.takeAction(0, 'fishing')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(foodBefore + 3)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.sourceCard).not.toBe(CARD_ID)
    expect(resp.interaction.promptKey).not.toBe('ui.interactionOptionalAction')
  })

  it('A095 S5: using a non-Fishing accumulation space offers no improvement', () => {
    const session = setup(2)
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === 'reed-bank')!.resources.reed = 2
    session.loadState(state)

    const response = session.takeAction(0, 'reed-bank')

    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]!.minorHand).toContain('A031_DebtSecurity')
  })

  it('A095 S6: another player using Fishing does not trigger the owner Angler', () => {
    const response = setup(2, 1).takeAction(1, 'fishing')

    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]!.minorHand).toContain('A031_DebtSecurity')
    expect(response.state.players[1]!.resources.food).toBe(2)
  })
})

describe('A095_Angler listener provenance guard', () => {
  it('ignores generic supply/cardEffect food even when result reports food gained', () => {
    const result = runListener([supplyCardEffectFood(2)], { food: 2 })

    expect(result).toBeUndefined()
  })

  it('ignores stale transaction food when current action has no food movement', () => {
    const result = runListener([fishingFood(2)], { food: 2 }, [])

    expect(result).toBeUndefined()
  })
})
