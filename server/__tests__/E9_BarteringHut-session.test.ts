import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import type { Resource } from '../../shared/contract/types'
import '../../shared/cards/E/E009_BarteringHut'

const CARD_ID = 'E009_BarteringHut'

const FILLER = '__test_placeholder__'

type Animal = 'sheep' | 'boar' | 'cattle'

type BuildingResource = 'wood' | 'clay' | 'reed' | 'stone'

const setup = (resources: Partial<Resource> = {}) => {
  const session = new GameSession(6009, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.pastures = []
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: index === 0 ? 0 : 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
  })
  const owner = state.players[0]!
  owner.minorHand = [CARD_ID]
  Object.assign(owner.resources, resources)
  owner.pastures = [
    { id: 'trade-pasture-1', size: 1, stables: 1, tiles: [{ row: 0, col: 2 }], animalType: null, animalCount: 0 },
    { id: 'trade-pasture-2', size: 1, stables: 1, tiles: [{ row: 1, col: 2 }], animalType: null, animalCount: 0 },
  ]
  owner.stableTiles = [{ row: 0, col: 2 }, { row: 1, col: 2 }]
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const playMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  if (!options(response).some((option) => option.value === CARD_ID)) {
    const improvement = options(response).find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  }
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, card!.value)
}

const resolveAnimalReorg = (session: GameSession, response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait'
    || response.interaction.request.kind !== 'animal-reorg') return response
  const player = response.state.players[0]!
  const zones = response.interaction.request.zones.map((zone) => ({ ...zone }))
  for (const animal of ['sheep', 'boar', 'cattle'] as const) {
    const total = player.resources[animal]
    if (total <= 0) continue
    const existing = zones.find((zone) => zone.animalType === animal)
    if (existing) {
      existing.animalCount = total
      continue
    }
    const empty = zones.find((zone) => zone.zoneType === 'pasture' && zone.animalCount === 0)
    expect(empty).toBeDefined()
    empty!.animalType = animal
    empty!.animalCount = total
  }
  return session.resolveChoice(response.interaction.playerIndex, 'confirm', { zones })
}

const takeTrade = (
  session: GameSession,
  initial: SessionResponse,
  animal: Animal,
  preferredPayments: BuildingResource[],
) => {
  let response = initial
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const animalOption = options(response).find((option) =>
    option.effectPreview?.resourcesGained?.[animal] === 1)
  expect(animalOption, JSON.stringify(response.interaction)).toBeDefined()
  response = session.resolveChoice(response.interaction.playerIndex, animalOption!.value)

  let paymentIndex = 0
  let safety = 20
  while (response.interaction.stateId === 'wait' && safety-- > 0) {
    if (response.interaction.request.kind === 'animal-reorg') {
      response = resolveAnimalReorg(session, response)
      continue
    }
    const payOptions = options(response).filter((option) => option.effectPreview?.resourcesPaid)
    if (payOptions.length === 0) break
    const preferred = preferredPayments[paymentIndex++]
    const selected = payOptions.find((option) =>
      preferred && option.effectPreview?.resourcesPaid?.[preferred] === 1) ?? payOptions[0]
    response = session.resolveChoice(response.interaction.playerIndex, selected!.value)
  }
  return response
}

const declineTrade = (session: GameSession, response: SessionResponse) => {
  expect(options(response).some((option) => option.value === '__skip__')).toBe(true)
  return session.resolveChoice(response.interaction.stateId === 'wait'
    ? response.interaction.playerIndex : 0, '__skip__')
}

describe('E009 Bartering Hut parity', () => {
  it('E009 S1: Bartering Hut is free, passes to the next player, and both trades may be declined', () => {
    const session = setup()
    let response = playMinor(session)

    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    response = declineTrade(session, response)
    response = declineTrade(session, response)

    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 0, boar: 0, cattle: 0 })
  })

  it('E009 S2: two mixed building resources buy one sheep', () => {
    const session = setup({ wood: 1, clay: 1 })
    let response = takeTrade(session, playMinor(session), 'sheep', ['wood', 'clay'])
    response = declineTrade(session, response)

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, sheep: 1 })
  })

  it('E009 S3: three building resources buy one pig', () => {
    const session = setup({ wood: 1, clay: 1, reed: 1 })
    let response = takeTrade(session, playMinor(session), 'boar', ['wood', 'clay', 'reed'])
    response = declineTrade(session, response)

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, reed: 0, boar: 1 })
  })

  it('E009 S4: four building resources buy one cattle', () => {
    const session = setup({ wood: 1, clay: 1, reed: 1, stone: 1 })
    let response = takeTrade(
      session, playMinor(session), 'cattle', ['wood', 'clay', 'reed', 'stone'],
    )
    response = declineTrade(session, response)

    expect(response.state.players[0]!.resources)
      .toMatchObject({ wood: 0, clay: 0, reed: 0, stone: 0, cattle: 1 })
  })

  it('E009 S5: Bartering Hut permits exactly two trades', () => {
    const session = setup({ wood: 3, clay: 2 })
    let response = takeTrade(session, playMinor(session), 'sheep', ['wood', 'clay'])
    response = takeTrade(session, response, 'boar', ['wood', 'wood', 'clay'])

    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, boar: 1 })
    const anotherAnimalOffer = options(response).some((option) =>
      option.effectPreview?.resourcesGained?.sheep === 1
      || option.effectPreview?.resourcesGained?.boar === 1
      || option.effectPreview?.resourcesGained?.cattle === 1)
    expect(anotherAnimalOffer).toBe(false)
  })

  it('E009 S6: declining the first trade still offers the second trade', () => {
    const session = setup({ wood: 2 })
    let response = declineTrade(session, playMinor(session))
    expect(options(response).some((option) => option.effectPreview?.resourcesGained?.sheep === 1))
      .toBe(true)
    response = takeTrade(session, response, 'sheep', ['wood', 'wood'])

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, sheep: 1 })
  })
})
