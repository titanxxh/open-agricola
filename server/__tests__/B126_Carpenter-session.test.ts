import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/B/B126_Carpenter'

const CARD_ID = 'B126_Carpenter'

const FILLER = '__test_placeholder__'

const setup = ({
  played = true, houseType = 'wood' as 'wood' | 'clay' | 'stone', resources = {},
}: {
  played?: boolean
  houseType?: 'wood' | 'clay' | 'stone'
  resources?: Partial<Record<'wood' | 'clay' | 'reed' | 'stone', number>>
} = {}) => {
  const session = new GameSession(6126, undefined, { playerCount: 4 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.houseType = houseType
  owner.resources = { ...owner.resources, ...resources }
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const playOccupation = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, card!.value)
}

const openRoomSelection = (session: GameSession) => {
  let response = session.takeAction(0, 'farm-expansion')
  if (response.interaction.stateId === 'wait') {
    const construct = options(response).find((option) => option.labelKey === 'actions.construct.name')
    if (construct) response = session.resolveChoice(response.interaction.playerIndex, construct.value)
  }
  return response
}

const buildRooms = (session: GameSession, count: number) => {
  const selection = openRoomSelection(session)
  expect(selection.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'room' } },
  })
  if (selection.interaction.stateId !== 'wait'
    || selection.interaction.request.kind !== 'farm-select') return selection
  const rooms = selection.interaction.request.farm.selectableTiles.slice(0, count)
  expect(rooms).toHaveLength(count)
  return session.commitSelectionChoice(selection.interaction.playerIndex, { rooms })
}

describe('B126 Carpenter parity', () => {
  it('B126 S1: Carpenter is played as the first occupation', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players).toHaveLength(4)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  for (const { scenario, houseType, resource } of [
    { scenario: 'S2', houseType: 'wood' as const, resource: 'wood' as const },
    { scenario: 'S3', houseType: 'clay' as const, resource: 'clay' as const },
    { scenario: 'S4', houseType: 'stone' as const, resource: 'stone' as const },
  ]) {
    it(`B126 ${scenario}: one ${houseType} room costs exactly three ${resource} and two reed`, () => {
      const response = buildRooms(setup({
        houseType, resources: { [resource]: 3, reed: 2 },
      }), 1)

      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.rooms).toBe(3)
      expect(response.state.players[0]!.resources).toMatchObject({ [resource]: 0, reed: 0 })
    })
  }

  it('B126 S5: lacking one room resource or one reed prevents a Carpenter room build', () => {
    for (const resources of [{ wood: 2, reed: 2 }, { wood: 3, reed: 1 }]) {
      const response = openRoomSelection(setup({ resources }))

      const roomSelection = response.interaction.stateId === 'wait'
        && response.interaction.request.kind === 'farm-select'
        && response.interaction.request.farm.farmType === 'room'
      expect(roomSelection).toBe(false)
      expect(options(response).some((option) => option.labelKey === 'actions.construct.name')).toBe(false)
      expect(response.state.players[0]!.rooms).toBe(2)
      expect(response.state.players[0]!.resources).toMatchObject(resources)
    }
  })

  it('B126 S6: two rooms cost six matching resources and four reed', () => {
    const response = buildRooms(setup({ resources: { wood: 6, reed: 4 } }), 2)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(4)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0 })
  })
})
