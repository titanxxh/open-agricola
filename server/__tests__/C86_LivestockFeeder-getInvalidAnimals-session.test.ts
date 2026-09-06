import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C086_LivestockFeeder'

const CARD_ID = 'C086_LivestockFeeder'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true, grain = 1, sheep = 0, boar = 0, cattle = 0, held = {},
}: {
  played?: boolean
  grain?: number
  sheep?: number
  boar?: number
  cattle?: number
  held?: Partial<Record<'sheep' | 'boar' | 'cattle', number>>
} = {}) => {
  const session = new GameSession(5086, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.fields = []
    player.pastures = []
    player.stableTiles = []
    player.stableAnimals = {}
    player.houseAnimalType = null
    player.houseAnimalCount = 0
    player.cardStates = {}
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
    setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  owner.resources = { ...owner.resources, grain, sheep, boar, cattle }
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  if (Object.values(held).some((count) => (count ?? 0) > 0)) {
    owner.cardStates[CARD_ID] = { extraData: { animalCounts: held } }
  }
  session.loadState(state)
  return session
}

const openReorganization = (session: GameSession, resources: {
  sheep?: number
  boar?: number
  cattle?: number
}) => {
  const response = session.devSetResources(0, resources)
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
    throw new Error('expected native animal reorganization')
  }
  return response
}

const cardZone = (response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
    throw new Error('expected native animal reorganization')
  }
  return response.interaction.request.zones.find((zone) => zone.id === `card:${CARD_ID}`)
}

const assignToCard = (response: SessionResponse, animalCounts: {
  sheep?: number
  boar?: number
  cattle?: number
}) => {
  const zone = cardZone(response)
  expect(zone).toBeDefined()
  const animalCount = Object.values(animalCounts).reduce((sum, count) => sum + (count ?? 0), 0)
  return { ...zone!, animalType: null, animalCount, animalCounts }
}

const cardAnimals = (response: SessionResponse) =>
  response.state.players[0]!.cardStates[CARD_ID]?.extraData?.animalCounts

const sowLastGrain = (session: GameSession) => {
  let response = session.takeAction(0, 'grain-utilization')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
    const sow = response.interaction.request.options?.find((option) => option.labelKey === 'actions.sow.name')
    expect(sow).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, sow!.value)
  }
  expect(response.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'sow' } },
  })
  return session.commitSelectionChoice(0, { crops: [{ row: 0, col: 0, crop: 'grain' }] })
}

describe('C086 Livestock Feeder parity', () => {
  it('C086 S1: playing Livestock Feeder as the first occupation costs no food and gains one grain', () => {
    const session = setup({ played: false, grain: 0 })
    let response = session.takeAction(0, 'lessons')
    if (response.state.players[0]!.occupationHand.includes(CARD_ID)
      && response.interaction.stateId === 'wait') {
      const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
      expect(option).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, option!.value)
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 20, grain: 1 })
  })

  it('C086 S2: two grain let Livestock Feeder hold two animals of different types', () => {
    const session = setup({ grain: 2 })
    const pending = openReorganization(session, { sheep: 1, boar: 1 })
    expect(cardZone(pending)).toMatchObject({ capacity: 2, allowedAnimalType: null })

    const response = session.resolveChoice(0, 'confirm', [
      assignToCard(pending, { sheep: 1, boar: 1 }),
    ] as unknown as Record<string, unknown>)

    expect(response.ok, response.error).toBe(true)
    expect(cardAnimals(response)).toEqual({ sheep: 1, boar: 1 })
  })

  it('C086 S3: without grain Livestock Feeder exposes no animal-holding zone', () => {
    const pending = openReorganization(setup({ grain: 0 }), { sheep: 1 })

    expect(cardZone(pending)).toBeUndefined()
  })

  it('C086 S4: an over-capacity assignment is accepted but clipped to current grain capacity', () => {
    const session = setup({ grain: 1 })
    const pending = openReorganization(session, { sheep: 2 })

    const response = session.resolveChoice(0, 'confirm', [
      assignToCard(pending, { sheep: 2 }),
    ] as unknown as Record<string, unknown>)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.sheep).toBe(1)
    expect(cardAnimals(response)).toEqual({ sheep: 1 })
  })

  it('C086 S5: sowing the last grain leaves the sheep stored on the now-absent card zone', () => {
    const session = setup({ grain: 1, sheep: 1, held: { sheep: 1 } })
    const state = session.getState().state
    state.players[0]!.fields = [{ row: 0, col: 0, stacks: [] }]
    session.loadState(state)

    const response = sowLastGrain(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, sheep: 1 })
    expect(response.state.players[0]!.houseAnimalCount).toBe(0)
    expect(cardAnimals(response)).toEqual({ sheep: 1 })
  })

  it('C086 S6: current grain count, not the amount when played, determines later capacity', () => {
    const session = setup({ grain: 3 })
    const pending = openReorganization(session, { sheep: 1, boar: 1, cattle: 1 })
    expect(cardZone(pending)?.capacity).toBe(3)

    const response = session.resolveChoice(0, 'confirm', [
      assignToCard(pending, { sheep: 1, boar: 1, cattle: 1 }),
    ] as unknown as Record<string, unknown>)

    expect(response.ok, response.error).toBe(true)
    expect(cardAnimals(response)).toEqual({ sheep: 1, boar: 1, cattle: 1 })
  })
})
