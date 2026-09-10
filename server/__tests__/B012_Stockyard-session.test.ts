import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/B/B012_Stockyard'

const CARD_ID = 'B012_Stockyard'

const CARD_ZONE = `card:${CARD_ID}`

const FILLER = '__test_placeholder__'

const setup = ({ played = true, wood = played ? 0 : 1, stone = played ? 0 : 1 } = {}) => {
  const session = new GameSession(6012, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.pastures = []
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID]
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.resources.wood = wood
  owner.resources.stone = stone
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = options(response).find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  return response
}

const playMinor = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId === 'wait') {
    const card = options(response).find((option) => option.value === CARD_ID)
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  }
  return response
}

const openReorganization = (
  session: GameSession, resources: { sheep?: number; boar?: number; cattle?: number },
) => {
  const response = session.devSetResources(0, resources)
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
    throw new Error('expected native animal reorganization')
  }
  expect(response.interaction.request.zones.find((zone) => zone.id === CARD_ZONE))
    .toMatchObject({ capacity: 3 })
  return response
}

const cardAssignment = (response: SessionResponse, animalCounts: Record<string, number>) => {
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
    throw new Error('expected native animal reorganization')
  }
  const zone = response.interaction.request.zones.find((candidate) => candidate.id === CARD_ZONE)
  expect(zone).toBeDefined()
  const entries = Object.entries(animalCounts).filter(([, count]) => count > 0)
  return {
    ...zone!,
    animalType: entries.length === 1 ? entries[0]![0] : null,
    animalCount: entries.reduce((sum, [, count]) => sum + count, 0),
    animalCounts,
  }
}

const heldAnimals = (response: SessionResponse) =>
  response.state.players[0]!.cardStates[CARD_ID]?.extraData?.animalCounts as
    | Record<string, number>
    | undefined

describe('B012 Stockyard parity', () => {
  it('B012 S1: paying one wood and one stone plays Stockyard for one point', () => {
    const response = playMinor(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, stone: 0 })
    const entry = response.scores?.[0]?.categories.find((category) => category.key === 'cards')
      ?.entries.find((candidate) => 'cardId' in candidate && candidate.cardId === CARD_ID)
    expect(entry?.score).toBe(1)
  })

  it('B012 S2: lacking either printed resource keeps Stockyard unavailable without payment', () => {
    for (const resources of [{ wood: 0, stone: 1 }, { wood: 1, stone: 0 }]) {
      const response = enterMinor(setup({ played: false, ...resources }))

      expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
      expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
      expect(response.state.players[0]!.resources).toMatchObject(resources)
    }
  })

  it('B012 S3: Stockyard holds three animals of one type without any pasture', () => {
    const session = setup()
    const pending = openReorganization(session, { sheep: 3 })

    const response = session.resolveChoice(0, 'confirm', {
      zones: [cardAssignment(pending, { sheep: 3 })],
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.sheep).toBe(3)
    expect(heldAnimals(response)).toEqual({ sheep: 3 })
  })

  it('B012 S4: Stockyard rejects mixed animal types and accepts a same-type retry', () => {
    const session = setup()
    const pending = openReorganization(session, { sheep: 1, boar: 1 })

    const rejected = session.resolveChoice(0, 'confirm', {
      zones: [cardAssignment(pending, { sheep: 1, boar: 1 })],
    })
    expect(rejected.ok).toBe(false)
    expect(rejected.state).toEqual(pending.state)

    const response = session.resolveChoice(0, 'confirm', {
      zones: [cardAssignment(pending, { sheep: 1 })],
    })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, boar: 0 })
    expect(heldAnimals(response)).toEqual({ sheep: 1 })
  })

  it('B012 S5: Stockyard rejects a fourth animal and accepts three on retry', () => {
    const session = setup()
    const pending = openReorganization(session, { sheep: 4 })

    const rejected = session.resolveChoice(0, 'confirm', {
      zones: [cardAssignment(pending, { sheep: 4 })],
    })
    expect(rejected.ok).toBe(false)
    expect(rejected.state).toEqual(pending.state)

    const response = session.resolveChoice(0, 'confirm', {
      zones: [cardAssignment(pending, { sheep: 3 })],
    })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.sheep).toBe(3)
    expect(heldAnimals(response)).toEqual({ sheep: 3 })
  })

  it('B012 S6: Stockyard is not counted as a pasture at scoring', () => {
    const session = setup()
    const pending = openReorganization(session, { sheep: 3 })
    const placed = session.resolveChoice(0, 'confirm', {
      zones: [cardAssignment(pending, { sheep: 3 })],
    })
    expect(placed.ok, placed.error).toBe(true)

    const response = session.getState()
    const pastures = response.scores[0]!.categories.find((category) => category.key === 'pastures')

    expect(pastures).toMatchObject({ quantity: 0, total: -1 })
    expect(heldAnimals(response)).toEqual({ sheep: 3 })
  })
})
