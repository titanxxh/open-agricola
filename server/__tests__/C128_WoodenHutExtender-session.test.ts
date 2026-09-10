import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/C/C128_WoodenHutExtender'

const CARD_ID = 'C128_WoodenHutExtender'

const FILLER = '__test_placeholder__'

const setup = ({
  played = true, round = 5, houseType = 'wood' as 'wood' | 'clay', resources = {},
}: {
  played?: boolean
  round?: number
  houseType?: 'wood' | 'clay'
  resources?: Partial<Record<'wood' | 'clay' | 'reed', number>>
} = {}) => {
  const session = new GameSession(6128, undefined, { playerCount: 3 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
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
  Object.assign(owner.resources, resources)
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
  expect(card, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, card!.value)
}

const enterRoomBuild = (session: GameSession) => {
  let response = session.takeAction(0, 'farm-expansion')
  if (response.interaction.stateId === 'wait'
    && response.interaction.request.farm?.farmType !== 'room') {
    const construct = options(response).find((option) => option.labelKey === 'actions.construct.name')
    if (construct) response = session.resolveChoice(response.interaction.playerIndex, construct.value)
  }
  return response
}

const buildRoom = (session: GameSession) => {
  const response = enterRoomBuild(session)
  expect(response.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'room' } },
  })
  if (response.interaction.stateId !== 'wait'
    || response.interaction.request.kind !== 'farm-select') return response
  const room = response.interaction.request.farm.selectableTiles[0]
  expect(room).toBeDefined()
  return session.commitSelectionChoice(response.interaction.playerIndex, { rooms: [room!] })
}

describe('C128 Wooden Hut Extender parity', () => {
  it('C128 S1: Wooden Hut Extender is played as the first occupation in a three-player game', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  for (const [scenario, round, wood] of [
    ['S2', 5, 5], ['S3', 6, 4], ['S4', 8, 3],
  ] as const) {
    it(`C128 ${scenario}: in round ${round} one wood room costs ${wood} wood and one reed`, () => {
      const response = buildRoom(setup({ round, resources: { wood, reed: 1 } }))

      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]).toMatchObject({
        houseType: 'wood', rooms: 3, resources: { wood: 0, reed: 0 },
      })
    })
  }

  it('C128 S5: a clay room still costs the normal five clay and two reed', () => {
    const response = buildRoom(setup({
      round: 8, houseType: 'clay', resources: { clay: 5, reed: 2 },
    }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay', rooms: 3, resources: { clay: 0, reed: 0 },
    })
  })

  it('C128 S6: one resource short of the round-eight cost prevents a room build', () => {
    for (const resources of [{ wood: 2, reed: 1 }, { wood: 3, reed: 0 }]) {
      const session = setup({ round: 8, resources })
      const response = enterRoomBuild(session)

      expect(response.state.players[0]!.rooms).toBe(2)
      expect(response.state.players[0]!.resources).toMatchObject(resources)
      expect(response.interaction.stateId === 'wait'
        && response.interaction.request.farm?.farmType === 'room').toBe(false)
    }
  })
})
