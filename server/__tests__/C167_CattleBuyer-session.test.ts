import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import type { AnimalType } from '../../shared/contract/types'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import '../../shared/cards/C/C167_CattleBuyer'

const CARD_ID = 'C167_CattleBuyer'

const FILLER = '__test_placeholder__'

const ONE_CELL = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']

const setup = ({ actor = 1, food = 2, played = true } = {}) => {
  const session = new GameSession(6167, undefined, { playerCount: 4 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = actor
  state.round = 14
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
    player.houseAnimalType = null
    player.houseAnimalCount = 0
    player.pastures = []
    player.stableAnimals = {}
    player.fenceSegments = []
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.resources.food = food
  state.players[actor]!.resources.wood = 4
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(card, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, card!.value)
}

const useFencing = (session: GameSession, actor = 1) => {
  let response = session.takeAction(actor, 'fencing')
  expect(response.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'fence' } },
  })
  response = session.commitSelectionChoice(actor, {
    edges: ONE_CELL, palisadeEdges: [], extraWood: 0,
  })
  return response
}

const enterPurchase = (session: GameSession, initial: SessionResponse) => {
  let response = initial
  for (let guard = 0; guard < 8; guard += 1) {
    response = resolveTriggerIfPresent(session, response, CARD_ID)
    if (response.interaction.stateId !== 'wait') return response
    if (response.interaction.request.kind === 'confirm-player-switch') {
      response = confirmPlayerSwitch(session)
      continue
    }
    const options = response.interaction.request.options ?? []
    if (options.some((option) => {
      const gained = option.effectPreview?.resourcesGained
      return gained?.sheep || gained?.boar || gained?.cattle
    })) return response
    const enter = options.find((option) =>
      option.sourceCard === CARD_ID && option.value !== '__skip__')
    if (!enter) return response
    response = session.resolveChoice(response.interaction.playerIndex, enter.value)
  }
  return response
}

const chooseAnimal = (session: GameSession, initial: SessionResponse, animal: AnimalType) => {
  let response = enterPurchase(session, initial)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) =>
    candidate.effectPreview?.resourcesGained?.[animal] === 1)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  response = session.resolveChoice(response.interaction.playerIndex, option!.value)
  if (response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'animal-reorg') {
    response = session.resolveChoice(response.interaction.playerIndex, 'confirm', {
      zones: [{ id: 'house', zoneType: 'house', animalType: animal, animalCount: 1 }],
    })
  }
  return response
}

describe('C167 Cattle Buyer parity', () => {
  it('C167 S1: Cattle Buyer is played as the first occupation in a four-player game', () => {
    const response = playOccupation(setup({ actor: 0, food: 0, played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it.each([
    { scenario: 'S2', animal: 'sheep', foodCost: 1 },
    { scenario: 'S3', animal: 'boar', foodCost: 2 },
    { scenario: 'S4', animal: 'cattle', foodCost: 2 },
  ] as const)('C167 $scenario: after an opponent uses Fencing the owner buys one $animal',
    ({ animal, foodCost }) => {
      const session = setup()
      const response = chooseAnimal(session, useFencing(session), animal)

      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources.food).toBe(2 - foodCost)
      expect(response.state.players[0]!.resources[animal]).toBe(1)
    })

  it('C167 S5: the owner may decline the purchase after an opponent uses Fencing', () => {
    const session = setup()
    let response = enterPurchase(session, useFencing(session))
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId === 'wait') {
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }

    expect(response.state.players[0]!.resources).toMatchObject({
      food: 2, sheep: 0, boar: 0, cattle: 0,
    })
  })

  it('C167 S6: one food permits only the sheep purchase', () => {
    const session = setup({ food: 1 })
    const response = enterPurchase(session, useFencing(session))
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const animalOptions = response.interaction.request.options?.filter((option) =>
      option.value !== '__skip__' && !option.disabled) ?? []

    expect(animalOptions).toHaveLength(1)
    expect(animalOptions[0]!.effectPreview?.resourcesGained).toMatchObject({ sheep: 1 })
  })

  it('C167 S7: without food an opponents Fencing grants no purchase', () => {
    const session = setup({ food: 0 })
    const response = enterPurchase(session, useFencing(session))

    expect(response.state.players[0]!.resources).toMatchObject({
      food: 0, sheep: 0, boar: 0, cattle: 0,
    })
    expect(response.interaction.stateId === 'wait'
      ? response.interaction.request.options?.some((option) => option.sourceCard === CARD_ID) ?? false
      : false).toBe(false)
  })

  it('C167 S8: the owners own Fencing action does not trigger Cattle Buyer', () => {
    const session = setup({ actor: 0 })
    const response = useFencing(session, 0)

    expect(response.state.players[0]!.resources).toMatchObject({
      food: 2, sheep: 0, boar: 0, cattle: 0,
    })
    expect(response.interaction.stateId === 'wait'
      ? response.interaction.request.options?.some((option) => option.sourceCard === CARD_ID) ?? false
      : false).toBe(false)
  })
})
