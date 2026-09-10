import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/B/B111_Rustic'

const CARD_ID = 'B111_Rustic'

const FILLER = '__test_placeholder__'

const setup = ({
  played = true, houseType = 'clay' as 'wood' | 'clay' | 'stone', resources = {},
}: {
  played?: boolean
  houseType?: 'wood' | 'clay' | 'stone'
  resources?: Partial<Record<'wood' | 'clay' | 'reed' | 'stone', number>>
} = {}) => {
  const session = new GameSession(6111, undefined, { playerCount: 4 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
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

const buildRooms = (session: GameSession, count: number) => {
  let response = session.takeAction(0, 'farm-expansion')
  if (response.interaction.stateId === 'wait') {
    const construct = options(response).find((option) => option.labelKey === 'actions.construct.name')
    if (construct) response = session.resolveChoice(response.interaction.playerIndex, construct.value)
  }
  expect(response.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'room' } },
  })
  if (response.interaction.stateId !== 'wait'
    || response.interaction.request.kind !== 'farm-select') return response
  const rooms = response.interaction.request.farm.selectableTiles.slice(0, count)
  expect(rooms).toHaveLength(count)
  return session.commitSelectionChoice(response.interaction.playerIndex, { rooms })
}

const renovate = (session: GameSession) => {
  let response = session.takeAction(0, 'house-redevelopment')
  if (response.interaction.stateId === 'wait'
    && response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
    response = session.resolveChoice(response.interaction.playerIndex, 'clay')
  }
  return response
}

const bonusVp = (response: SessionResponse) =>
  response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0

describe('B111 Rustic parity', () => {
  it('B111 S1: Rustic is played as the first occupation', () => {
    const response = playOccupation(setup({ played: false }))
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players).toHaveLength(4)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('B111 S2: building one clay room gains two food and one bonus point', () => {
    const response = buildRooms(setup({ resources: { clay: 5, reed: 2 } }), 1)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(bonusVp(response)).toBe(1)
  })

  it('B111 S3: building two clay rooms gains four food and two bonus points', () => {
    const response = buildRooms(setup({ resources: { clay: 10, reed: 4 } }), 2)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(4)
    expect(response.state.players[0]!.resources.food).toBe(4)
    expect(bonusVp(response)).toBe(2)
  })

  it.each([
    { scenario: 'S4', houseType: 'wood', resource: 'wood' },
    { scenario: 'S5', houseType: 'stone', resource: 'stone' },
  ] as const)('B111 $scenario: building a $houseType room grants no Rustic reward',
    ({ houseType, resource }) => {
      const response = buildRooms(setup({
        houseType, resources: { [resource]: 5, reed: 2 },
      }), 1)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.rooms).toBe(3)
      expect(response.state.players[0]!.resources.food).toBe(0)
      expect(bonusVp(response)).toBe(0)
    })

  it('B111 S6: renovating a wooden house to clay grants no Rustic reward', () => {
    const response = renovate(setup({
      houseType: 'wood', resources: { clay: 2, reed: 1 },
    }))
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('clay')
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(bonusVp(response)).toBe(0)
  })
})
