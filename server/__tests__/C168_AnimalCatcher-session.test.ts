import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/C/C168_AnimalCatcher'

const CARD_ID = 'C168_AnimalCatcher'
const ANIMALS = ['sheep', 'boar', 'cattle'] as const

const setup = ({ round = 1, food = 10, fireplace = false } = {}) => {
  const session = new GameSession(168, undefined, { playerCount: 2 })
  const state = session.state
  state.round = round
  state.roundPhase = 'work'
  state.currentPlayerIndex = 0
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.houseAnimalType = null
    player.houseAnimalCount = 0
    player.stableAnimals = {}
    player.resources = { ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 0, sheep: 0, boar: 0, cattle: 0 }
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, 2)
  }
  const player = state.players[0]!
  player.occupationPlayed = [CARD_ID]
  player.resources.food = food
  player.improvements = fireplace ? ['Major_Fireplace1'] : []
  player.pastures = [{ row: 0, col: 2 }, { row: 0, col: 4 }, { row: 2, col: 4 }].map((tile, index) => ({
    id: `pasture-${index}`, tiles: [tile], size: 1, stables: 0, animalType: null, animalCount: 0,
  }))
  session.loadState(state)
  return session
}

const chooseAnimals = (session: GameSession) => {
  const offered = session.takeAction(0, 'day-laborer')
  expect(offered.ok, offered.error).toBe(true)
  expect(offered.interaction.promptKey).toBe('ui.interactionSelectReplacement')
  expect(offered.state.players[0]!.resources).toMatchObject({ sheep: 0, boar: 0, cattle: 0 })
  const choice = offered.interaction.request.options!.find((option) => option.sourceCard === CARD_ID)!
  return session.resolveChoice(0, choice.value)
}

const houseAnimals = (session: GameSession, response: SessionResponse) => {
  if (response.interaction.request.kind !== 'animal-reorg') return response
  const zones = ANIMALS.flatMap((animalType, index) => response.state.players[0]!.resources[animalType] > 0
    ? [{ id: `pasture-${index}`, zoneType: 'pasture', animalType, animalCount: 1 }] : [])
  return session.resolveChoice(0, 'confirm', { zones })
}

describe('C168 Animal Catcher committed replacement', () => {
  it.each([[1, 6], [11, 3]])('gains three animals and pays the remaining %i round harvest cost of %i', (round, cost) => {
    const session = setup({ round })
    let response = chooseAnimals(session)
    expect(response.ok, response.error).toBe(true)
    response = houseAnimals(session, response)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 10 - cost, sheep: 1, boar: 1, cattle: 1 })
    expect(response.interaction.request.kind).toBe('confirm-next-player')
    expect(response.state.events.filter((event) => event.type === 'resource.paid' && event.resources.food === cost)).toHaveLength(1)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).not.toBe(true)
  })

  it('declines replacement to gain only the normal two food', () => {
    const session = setup({ food: 5 })
    const offered = session.takeAction(0, 'day-laborer')
    const original = offered.interaction.request.options!.find((option) => option.labelKey === 'ui.interactionDoNotReplace')!
    const response = session.resolveChoice(0, original.value)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 7, sheep: 0, boar: 0, cattle: 0 })
    expect(response.interaction.request.kind).toBe('confirm-next-player')
  })

  it('retains received animals when payment is blocked and restores them on Undo Action', () => {
    const session = setup({ food: 5 })
    const blocked = chooseAnimals(session)
    expect(blocked.interaction.request.kind).toBe('engine-blocked')
    expect(blocked.state.players[0]!.resources).toMatchObject({ food: 5, sheep: 1, boar: 1, cattle: 1 })
    const response = session.undoAction(0)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 5, sheep: 0, boar: 0, cattle: 0 })
    expect(response.state.actionSpaces.find((space) => space.id === 'day-laborer')!.takenBy).toEqual([])
  })

  it('cooks the newly received sheep to fund the required payment and continue', () => {
    const session = setup({ food: 5, fireplace: true })
    let response = chooseAnimals(session)
    expect(response.interaction.promptKey).toBe('ui.interactionBeforeAnytime')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 5, sheep: 1, boar: 1, cattle: 1 })
    response = session.takeAnytimeAction(0, 'exchange')
    const cook = response.interaction.request.options!.find((option) => option.effectPreview?.resourcesPaid?.sheep === 1)!
    expect(cook, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(0, cook.value)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 7, sheep: 0 })
    expect(response.interaction.promptKey).toBe('ui.interactionBeforeAnytime')
    response = session.resolveChoice(0, 'continue')
    response = houseAnimals(session, response)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, sheep: 0, boar: 1, cattle: 1 })
    expect(response.interaction.request.kind).toBe('confirm-next-player')
  })

  it('does not offer the animal replacement on Grain Seeds', () => {
    const response = setup().takeAction(0, 'grain-seeds')
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 10, sheep: 0, boar: 0, cattle: 0 })
    expect(response.interaction.request.kind).toBe('confirm-next-player')
  })
})
