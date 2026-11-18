import { afterEach, describe, expect, it } from 'vitest'
import { markAllWorkersUsed } from '../../shared/domain/player'
import type { PlayerState } from '../../shared/contract/types'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import { descriptionEffects } from './_helpers/choice-description'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

// A158 and B135 turn animals into food through the shared Exchange path, so
// every card that observes animal-to-food exchanges sees these conversions.
const CULINARY_ARTIST = 'A158_CulinaryArtist'
const NUTRITION_EXPERT = 'B135_NutritionExpert'
const BREED_REGISTRY = 'D036_BreedRegistry'
const MASTER_TANNER = 'E085_MasterTanner'
const OAK_BARK = 'M115_OakBark'
const NO_GOODS = { food: 0, wood: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 }

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

function settlePlayerSwitches(session: GameSession, initial: SessionResponse) {
  let response = initial
  while (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-player-switch') {
    expect(response.ok, response.error).toBe(true)
    response = confirmPlayerSwitch(session)
  }
  return response
}

const options = (response: SessionResponse) =>
  response.interaction.stateId === 'wait' ? response.interaction.request.options ?? [] : []

const houseAnimal = (player: PlayerState, animal: 'sheep' | 'boar' | 'cattle') => {
  const room = player.roomTiles[0]!
  player.houseAnimals = { [`${room.row}-${room.col}`]: animal }
  player.resources[animal] = 1
}

const exchangesFrom = (response: SessionResponse, source: string) =>
  response.state.events.filter((event) => event.type === 'resource.exchanged' && event.exchangeSource === source)

const cardBonusVp = (response: SessionResponse, playerIndex: number, cardId: string) =>
  response.scores?.[playerIndex]?.categories.find((category) => category.key === 'cardBonusVp')?.entries
    .find((entry) => 'cardId' in entry && entry.cardId === cardId)?.score ?? 0

/** Round 3 ends with every worker used, so Nutrition Expert offers its exchange at the start of round 4. */
function nutritionExpertSession(
  animal: 'sheep' | 'boar' | 'cattle',
  occupations: string[],
  minors: string[] = [],
  moor = false,
) {
  const session = createWorkSession({
    options: moor ? { enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true } : undefined,
    configure(state) {
      state.round = 3
      state.players.forEach((player) => {
        Object.assign(player.resources, NO_GOODS)
        markAllWorkersUsed(state, player)
      })
      const owner = state.players[0]!
      owner.occupationPlayed = occupations
      owner.minorPlayed = minors
      Object.assign(owner.resources, { grain: 1, vegetable: 1 })
      houseAnimal(owner, animal)
    },
  })
  sessions.push(session)
  const response = settlePlayerSwitches(session, session.performRoundEnd())
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'choice' } })
  const accept = options(response).find((option) => !option.disabled && option.value !== '__skip__')
  expect(accept, JSON.stringify(response.interaction)).toBeDefined()
  return { session, response: session.resolveChoice(0, accept!.value) }
}

function expectNutritionExpertExchange(response: SessionResponse, animal: 'sheep' | 'boar' | 'cattle') {
  expect(exchangesFrom(response, NUTRITION_EXPERT)).toEqual([expect.objectContaining({
    actorPlayerId: response.state.players[0]!.id,
    paid: { [animal]: 1, grain: 1, vegetable: 1 },
    gained: { food: 5 },
  })])
  expect(response.state.players[0]!.cardStates[NUTRITION_EXPERT]?.counters?.bonusVp).toBe(2)
  expect(JSON.stringify(response.state.log)).toContain(NUTRITION_EXPERT)
}

describe('animal-to-food exchanges from Culinary Artist and Nutrition Expert', () => {
  // Culinary Artist is a 4+ player card and Traveling Players exists only in those games.
  it.each([
    { resource: 'sheep', food: 5, converted: true, bonus: 0 },
    { resource: 'grain', food: 4, converted: false, bonus: 3 },
  ] as const)('Breed Registry records Culinary Artist turning $resource into food', ({
    resource, food, converted, bonus,
  }) => {
    const session = createWorkSession({
      options: { playerCount: 4 },
      configure(state) {
        state.currentPlayerIndex = 2
        state.players.forEach((player) => Object.assign(player.resources, NO_GOODS))
        const owner = state.players[1]!
        owner.occupationPlayed = [CULINARY_ARTIST]
        owner.minorPlayed = [BREED_REGISTRY]
        if (resource === 'sheep') houseAnimal(owner, 'sheep')
        else owner.resources.grain = 1
      },
    })
    sessions.push(session)
    expect(cardBonusVp(session.getState(), 1, BREED_REGISTRY)).toBe(3)

    let response = settlePlayerSwitches(session, session.takeAction(2, 'traveling-players'))
    expect(response.ok, response.error).toBe(true)
    response = resolveTriggerIfPresent(session, response, CULINARY_ARTIST)
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 1, request: { kind: 'choice' } })
    const choice = options(response).find((option) => !option.disabled &&
      descriptionEffects(option.descriptionPreview).some((effect) =>
        (effect.kind === 'payment' || effect.kind === 'resourceExchange') && effect.resourcesPaid?.[resource] === 1))
    expect(choice, JSON.stringify(response.interaction)).toBeDefined()
    response = settlePlayerSwitches(session, session.resolveChoice(1, choice!.value))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[1]!.resources).toMatchObject({ [resource]: 0, food })
    expect(exchangesFrom(response, CULINARY_ARTIST)).toEqual([expect.objectContaining({
      actorPlayerId: response.state.players[1]!.id, paid: { [resource]: 1 }, gained: { food },
    })])
    expect(Boolean(response.state.players[1]!.cardStates[BREED_REGISTRY]?.extraData?.sheepConvertedToFood))
      .toBe(converted)
    expect(cardBonusVp(response, 1, BREED_REGISTRY)).toBe(bonus)
    expect(JSON.stringify(response.state.log)).toContain(CULINARY_ARTIST)
  })

  it.each([
    { animal: 'boar', stored: 1 },
    { animal: 'cattle', stored: 1 },
    { animal: 'sheep', stored: 0 },
  ] as const)('Master Tanner offers storage after Nutrition Expert turns a $animal into food', ({ animal, stored }) => {
    const started = nutritionExpertSession(animal, [NUTRITION_EXPERT, MASTER_TANNER])
    let response = resolveTriggerIfPresent(started.session, started.response, MASTER_TANNER)
    expect(response.ok, response.error).toBe(true)
    if (stored > 0) {
      expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'choice' } })
      const store = options(response).find((option) =>
        descriptionEffects(option.descriptionPreview).some((effect) =>
          effect.kind === 'payment' && effect.resourcesPaid?.food === stored))
      expect(store, JSON.stringify(response.interaction)).toBeDefined()
      response = started.session.resolveChoice(0, store!.value)
    }
    response = settlePlayerSwitches(started.session, response)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ [animal]: 0, grain: 0, vegetable: 0, food: 5 - stored })
    expect(response.state.players[0]!.cardStates[MASTER_TANNER]?.stack?.filter((item) => item === 'food') ?? [])
      .toHaveLength(stored)
    expectNutritionExpertExchange(response, animal)
    expect(response.state.round).toBe(4)
    expect(response.interaction.stateId).toBe('idle')
  })

  it.each([
    { animal: 'cattle', wood: 1 },
    { animal: 'boar', wood: 1 },
    { animal: 'sheep', wood: 0 },
  ] as const)('Oak Bark grants wood after Nutrition Expert turns a $animal into food', ({ animal, wood }) => {
    const started = nutritionExpertSession(animal, [NUTRITION_EXPERT], [OAK_BARK], true)
    const response = settlePlayerSwitches(started.session, started.response)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ [animal]: 0, grain: 0, vegetable: 0, food: 5, wood })
    expectNutritionExpertExchange(response, animal)
    expect(JSON.stringify(response.state.log).includes(OAK_BARK)).toBe(wood > 0)
    expect(response.state.round).toBe(4)
    expect(response.interaction.stateId).toBe('idle')
  })
})
