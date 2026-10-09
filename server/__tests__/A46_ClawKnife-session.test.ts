import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { A046_ClawKnife } from '../../shared/cards/A/A046_ClawKnife'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

const CARD_ID = 'A046_ClawKnife'
const FILLER = '__test_placeholder__'

const pasture = (id: string, col: number) => ({
  id,
  tiles: [{ row: 0, col }],
  animalType: null,
  animalCount: 0,
  size: 1,
  stables: 0,
})

const setup = ({ pastures = 1, round = 5, played = true, actor = 0 } = {}) => {
  const session = new GameSession(5046, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  })
  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [CARD_ID]
  player.minorPlayed = played ? [CARD_ID] : []
  player.resources.wood = played ? 0 : 1
  player.pastures = Array.from({ length: pastures }, (_, index) => pasture(`p${index + 1}`, index))
  const sheepMarket = state.actionSpaces.find((space) => space.id === 'sheep-market')
  if (!sheepMarket) throw new Error('sheep-market missing')
  sheepMarket.resources.sheep = 1
  session.loadState(state)
  return session
}

const openMinorPrompt = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  if (!response.interaction.request.options?.some((option) => option.value === CARD_ID)) {
    const improvement = response.interaction.request.options?.find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(0, improvement.value)
  }
  return response
}

const playClawKnife = (session: GameSession) => {
  const response = openMinorPrompt(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(0, card!.value)
}

const futureRounds = (session: GameSession) => session.getState().state.futureMeeples
  .filter((entry) => entry.cardId === CARD_ID && (entry.resources.food ?? 0) > 0)
  .flatMap((entry) => Array.from({ length: entry.resources.food ?? 0 }, () => entry.round))
  .sort((left, right) => left - right)

const useSheepMarket = (session: GameSession, actor = 0) => {
  let response = session.takeAction(actor, 'sheep-market')
  if (
    response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'animal-reorg'
  ) {
    const zones = actor === 0
      ? [{ id: 'p1', zoneType: 'pasture', animalType: 'sheep', animalCount: 1 }]
      : [{ id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 }]
    response = session.resolveChoice(actor, 'confirm', zones as unknown as Record<string, unknown>)
  }
  return resolveTriggerIfPresent(session, response, CARD_ID)
}

describe('A046_ClawKnife prerequisite', () => {
  it('blocks when player has zero pastures', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = []
    expect(meetsCardPrerequisites(player, A046_ClawKnife, state.round, state)).toBe(false)
  })

  it('allows when player has exactly 1 pasture', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = [{
      id: 'p1',
      tiles: [{ row: 0, col: 0 }],
      animalType: null,
      animalCount: 0,
      size: 1,
      stables: 0,
    }]
    expect(meetsCardPrerequisites(player, A046_ClawKnife, state.round, state)).toBe(true)
  })

  it('blocks when player has 2 pastures', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = [
      { id: 'p1', tiles: [{ row: 0, col: 0 }], animalType: null, animalCount: 0, size: 1, stables: 0 },
      { id: 'p2', tiles: [{ row: 1, col: 0 }], animalType: null, animalCount: 0, size: 1, stables: 0 },
    ]
    expect(meetsCardPrerequisites(player, A046_ClawKnife, state.round, state)).toBe(false)
  })
})

describe('A046 Claw Knife parity', () => {
  it('A046 S1: exactly one pasture allows paying one wood to play Claw Knife', () => {
    const response = playClawKnife(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it.each([['S2', 0], ['S3', 2]])(
    'A046 %s: %i pastures keep Claw Knife unavailable',
    (_scenario, pastures) => {
      const response = openMinorPrompt(setup({ pastures, played: false }))

      expect(response.interaction.stateId === 'wait'
        ? response.interaction.request.options?.some((option) => option.value === CARD_ID) ?? false
        : false).toBe(false)
      expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    },
  )

  it('A046 S4: using Sheep Market schedules food on each of the next two rounds', () => {
    const session = setup({ round: 5 })
    const response = useSheepMarket(session)

    expect(response.ok, response.error).toBe(true)
    expect(futureRounds(session)).toEqual([6, 7])
  })

  it('A046 S5: a non-Sheep-Market action schedules no food', () => {
    const session = setup({ round: 5 })
    const response = session.takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(futureRounds(session)).toEqual([])
  })

  it('A046 S6: at round thirteen only the reachable round fourteen food is scheduled', () => {
    const session = setup({ round: 13 })
    const response = useSheepMarket(session)

    expect(response.ok, response.error).toBe(true)
    expect(futureRounds(session)).toEqual([14])
  })

  it('A046 S7: another player using Sheep Market schedules no food for the owner', () => {
    const session = setup({ actor: 1 })
    const response = useSheepMarket(session, 1)

    expect(response.ok, response.error).toBe(true)
    expect(futureRounds(session)).toEqual([])
  })
})
