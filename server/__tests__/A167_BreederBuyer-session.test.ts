import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A167_BreederBuyer'

const CARD_ID = 'A167_BreederBuyer'

const FILLER = '__test_placeholder__'

const setup = ({
  houseType = 'wood', played = true, resources = {},
}: {
  houseType?: 'wood' | 'clay' | 'stone'
  played?: boolean
  resources?: Partial<Record<'wood' | 'clay' | 'stone' | 'reed', number>>
} = {}) => {
  const session = new GameSession(6167, undefined, { playerCount: 4 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0,
    }
    player.houseAnimalType = null
    player.houseAnimalCount = 0
    player.pastures = []
    player.stableAnimals = {}
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.houseType = houseType
  Object.assign(owner.resources, resources)
  const farmExpansion = state.actionSpaces.find((space) => space.id === 'farm-expansion')
  if (!farmExpansion) throw new Error('farm-expansion missing')
  farmExpansion.takenBy = []
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const chooseMode = (session: GameSession, response: SessionResponse, labelKey: string) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const requestedFarmType = labelKey === 'actions.construct.name' ? 'room' : 'stable'
  if (response.interaction.request.kind === 'farm-select'
    && response.interaction.request.farm.farmType === requestedFarmType) {
    return response
  }
  const option = response.interaction.request.options?.find((candidate) =>
    candidate.labelKey === labelKey
      || (requestedFarmType === 'stable' && candidate.labelKey === 'actions.stables.name'))
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const buildRoomsAndStables = (session: GameSession, roomCount = 1, stableCount = 1) => {
  let response = chooseMode(session, session.takeAction(0, 'farm-expansion'), 'actions.construct.name')
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') return response
  const rooms = response.interaction.request.farm.selectableTiles.slice(0, roomCount)
  response = session.commitSelectionChoice(0, { rooms })
  response = chooseMode(session, response, 'actions.buildStables.name')
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') return response
  const stables = response.interaction.request.farm.selectableTiles.slice(0, stableCount)
  return session.commitSelectionChoice(0, { stables })
}

describe('A167 Breeder Buyer parity', () => {
  it('A167 S1: Breeder Buyer is played as the first occupation in a four-player game', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it.each([
    { scenario: 'S2', houseType: 'wood', resources: { wood: 7, reed: 2 }, animal: 'sheep' },
    { scenario: 'S3', houseType: 'clay', resources: { wood: 2, clay: 5, reed: 2 }, animal: 'boar' },
    { scenario: 'S4', houseType: 'stone', resources: { wood: 2, stone: 5, reed: 2 }, animal: 'cattle' },
  ] as const)('A167 $scenario: building a $houseType room and stable together gains one $animal',
    ({ houseType, resources, animal }) => {
      const response = buildRoomsAndStables(setup({ houseType, resources }))

      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources[animal]).toBe(1)
    })

  it('A167 S5: building only a room or only a stable grants no animal', () => {
    const roomSession = setup({ resources: { wood: 5, reed: 2 } })
    let roomOnly = chooseMode(
      roomSession, roomSession.takeAction(0, 'farm-expansion'), 'actions.construct.name',
    )
    if (roomOnly.interaction.stateId === 'wait'
      && roomOnly.interaction.request.kind === 'farm-select') {
      const room = roomOnly.interaction.request.farm.selectableTiles[0]!
      roomOnly = roomSession.commitSelectionChoice(0, { rooms: [room] })
    }
    expect(roomOnly.state.players[0]!.resources.sheep).toBe(0)

    const stableSession = setup({ resources: { wood: 2 } })
    let stableOnly = chooseMode(
      stableSession, stableSession.takeAction(0, 'farm-expansion'), 'actions.buildStables.name',
    )
    if (stableOnly.interaction.stateId === 'wait'
      && stableOnly.interaction.request.kind === 'farm-select') {
      const stable = stableOnly.interaction.request.farm.selectableTiles[0]!
      stableOnly = stableSession.commitSelectionChoice(0, { stables: [stable] })
    }
    expect(stableOnly.state.players[0]!.resources.sheep).toBe(0)
  })

  it('A167 S6: multiple rooms and stables in one action still grant only one animal', () => {
    const response = buildRoomsAndStables(setup({ resources: { wood: 14, reed: 4 } }), 2, 2)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.sheep).toBe(1)
  })
})
