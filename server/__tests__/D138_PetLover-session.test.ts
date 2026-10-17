import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import type { AnimalType } from '../../shared/contract/types'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D138_PetLover'
import assert from 'node:assert/strict'
import { assertEmptyAccumulationRejected } from './_helpers/negative-rule-audit'
import * as audit53Cards from './_helpers/audit/ae-negative-53-cards'

const CARD_ID = 'D138_PetLover'
const FILLER = '__test_placeholder__'

const MARKET_IDS = {
  sheep: 'sheep-market',
  boar: 'pig-market',
  cattle: 'cattle-market',
} as const

type MarketAnimal = keyof typeof MARKET_IDS
type ZoneAssignment = {
  id: string
  zoneType: 'pasture' | 'house' | 'card'
  animalType: AnimalType | null
  animalCount: number
  cardId?: string
}

const setup = ({
  played = true, marketAnimal = 'sheep' as MarketAnimal, marketCount = 1,
} = {}) => {
  const session = new GameSession(6138, undefined, { playerCount: 3 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => {
    space.takenBy = []
  })
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.houseAnimals = {};
    player.stableAnimals = {}
    player.pastures = [{
      id: `pasture-${index}`, size: 1, tiles: [{ row: 0, col: 1 }], stables: 0,
      animalType: null, animalCount: 0,
    }]
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  const market = state.actionSpaces.find((space) => space.id === MARKET_IDS[marketAnimal])!
  market.resources[marketAnimal] = marketCount
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const resolveAnimalReorg = (
  session: GameSession,
  response: SessionResponse,
  animalType: MarketAnimal,
  animalCount: number,
) => {
  if (response.interaction.stateId !== 'wait'
    || response.interaction.request.kind !== 'animal-reorg') return response
  const zones: ZoneAssignment[] = [{
    id: 'pasture-0', zoneType: 'pasture', animalType, animalCount,
  }]
  const resolved = session.resolveChoice(
    response.interaction.playerIndex,
    'confirm',
    zones as unknown as Record<string, unknown>,
  )
  expect(resolved.ok, resolved.error).toBe(true)
  return resolved
}

const choosePetLoverBranch = (
  session: GameSession,
  response: SessionResponse,
  usePetLover: boolean,
) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const branch = response.interaction.request.options?.find((option) =>
    usePetLover ? option.sourceCard === CARD_ID : option.sourceCard !== CARD_ID)
  expect(branch, JSON.stringify(response.interaction)).toBeDefined()
  const selected = session.resolveChoice(response.interaction.playerIndex, branch!.value)
  expect(selected.ok, selected.error).toBe(true)
  return selected
}

const takePetLoverMarket = (
  session: GameSession,
  animalType: MarketAnimal,
  usePetLover: boolean,
) => {
  let response = session.takeAction(0, MARKET_IDS[animalType])
  expect(response.ok, response.error).toBe(true)
  response = choosePetLoverBranch(session, response, usePetLover)
  return resolveAnimalReorg(session, response, animalType, 1)
}

describe('D138 Pet Lover parity', () => {
  it('D138 S1: Pet Lover can be played as the first occupation in a three-player game', () => {
    const session = setup({ played: false })
    let response = session.takeAction(0, 'lessons')
    expect(response.ok, response.error).toBe(true)
    if (response.state.players[0]!.occupationHand.includes(CARD_ID)) {
      const card = options(response).find((option) => option.value === CARD_ID)
      expect(card, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, card!.value)
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('D138 S2: the normal branch takes exactly one sheep and grants no Pet Lover bonus', () => {
    const session = setup()

    const response = takePetLoverMarket(session, 'sheep', false)

    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, food: 0, grain: 0 })
    expect(response.state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep)
      .toBe(0)
  })

  it('D138 S3: the Pet Lover branch leaves one sheep and gains a supply sheep, three food, and one grain', () => {
    const session = setup()

    const response = takePetLoverMarket(session, 'sheep', true)

    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, food: 3, grain: 1 })
    expect(response.state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep)
      .toBe(1)
  })

  it('D138 S4: two sheep offer no Pet Lover branch and are collected normally', () => {
    const session = setup({ marketCount: 2 })

    let response = session.takeAction(0, 'sheep-market')
    expect(response.ok, response.error).toBe(true)
    expect(options(response).some((option) => option.sourceCard === CARD_ID)).toBe(false)
    response = resolveAnimalReorg(session, response, 'sheep', 2)

    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 2, food: 0, grain: 0 })
    expect(response.state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep)
      .toBe(0)
  })

  it('D138 S5: the Pet Lover branch works on Pig Market with exactly one boar', () => {
    const session = setup({ marketAnimal: 'boar' })

    const response = takePetLoverMarket(session, 'boar', true)

    expect(response.state.players[0]!.resources).toMatchObject({ boar: 1, food: 3, grain: 1 })
    expect(response.state.actionSpaces.find((space) => space.id === 'pig-market')!.resources.boar)
      .toBe(1)
  })

  it('D138 S6: the Pet Lover branch works on Cattle Market with exactly one cattle', () => {
    const session = setup({ marketAnimal: 'cattle' })

    const response = takePetLoverMarket(session, 'cattle', true)

    expect(response.state.players[0]!.resources).toMatchObject({ cattle: 1, food: 3, grain: 1 })
    expect(response.state.actionSpaces.find((space) => space.id === 'cattle-market')!.resources.cattle)
      .toBe(1)
  })

  it('D138 S7: a non-animal accumulation space grants no Pet Lover resources', () => {
    const session = setup()
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 3
    session.loadState(state)

    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      wood: 3, sheep: 0, boar: 0, cattle: 0, food: 0, grain: 0,
    })
    expect(options(response).some((option) => option.sourceCard === CARD_ID)).toBe(false)
  })

  it('D138 S8: an empty animal market offers no Pet Lover branch or reward', () => {
    const session = setup({ marketCount: 0 })

    const response = session.takeAction(0, 'sheep-market')

    expect(response.ok).toBe(false)
    expect(options(response).some((option) => option.sourceCard === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 0, food: 0, grain: 0 })
    expect(response.state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep)
      .toBe(0)
  })
})

describe('ae-negative-53-cards', () => {
  const { sessions, save, ok, make, finish, ready, resources, pool, farm, pet } = audit53Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('D138 N1 each exactly-one animal market replacement leaves its original animal and grants supply animal three food grain', () => { for (const [space, good] of [['sheep-market', 'sheep'], ['pig-market', 'boar'], ['cattle-market', 'cattle']] as const) { const s = make('D138_PetLover', st => { farm(st); pool(st, space, good, 1) }, true, 14), p = ok(s.takeAction(0, space)), r = pet(s, p, true); resources(r, { [good]: 1, food: 103, grain: 1 }); assert.equal(r.state.actionSpaces.find(a => a.id === space)!.resources[good], 1); save(`D138-N1-${good}`, { p, r }) } })
  it('D138 N2 normal collection of one and zero or two accumulated animals give no replacement bonus', () => { for (const count of [0, 1, 2]) { const s = make('D138_PetLover', st => { farm(st); pool(st, 'sheep-market', 'sheep', count) }), p = count === 0 ? assertEmptyAccumulationRejected(s, 0, 'sheep-market') : ok(s.takeAction(0, 'sheep-market')), r = count === 0 ? p : count === 1 ? pet(s, p, false) : finish(s, p, false); resources(r, { sheep: count, food: 100, grain: 0 }); assert.equal(r.state.actionSpaces.find(a => a.id === 'sheep-market')!.resources.sheep, 0); save(`D138-N2-${count}`, { p, r }) } })
  it('D138 N3 actual opponent market and hand-only Pet Lover collect normally without replacement', () => { const s = make('D138_PetLover', st => pool(st, 'sheep-market', 'sheep', 1)); finish(s, ok(s.takeAction(0, 'grain-seeds')), false); ready(s); const r = finish(s, ok(s.takeAction(1, 'sheep-market')), false); resources(r, { food: 100, grain: 1, sheep: 0 }); resources(r, { food: 100, grain: 0, sheep: 1 }, 1); const c = make('D138_PetLover', st => pool(st, 'sheep-market', 'sheep', 1), false), cr = finish(c, ok(c.takeAction(0, 'sheep-market')), false); resources(cr, { sheep: 1, food: 100, grain: 0 }); save('D138-N3', { r, cr }) })
})
