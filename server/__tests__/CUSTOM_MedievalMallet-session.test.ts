import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/community/CUSTOM_MedievalMallet'

const CARD_ID = 'CUSTOM_MedievalMallet'
const FILLER = '__test_placeholder__'

type Building = 'wood' | 'clay' | 'reed' | 'stone'

const setup = ({
  played = true,
  houseType = 'wood' as 'wood' | 'clay' | 'stone',
  resources = {} as Partial<Record<Building, number>>,
  majors = [] as string[],
  minorHand = [FILLER],
} = {}) => {
  const session = new GameSession(7041)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = majors
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
  owner.minorHand = minorHand
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.houseType = houseType
  owner.resources = { ...owner.resources, ...resources }
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const openRoomSelection = (session: GameSession) => {
  let response = session.takeAction(0, 'farm-expansion')
  if (response.interaction.stateId === 'wait') {
    const construct = options(response).find((option) => option.labelKey === 'actions.construct.name')
    if (construct) response = session.resolveChoice(response.interaction.playerIndex, construct.value)
  }
  return response
}

const isRoomSelection = (response: SessionResponse) => response.interaction.stateId === 'wait'
  && response.interaction.request.kind === 'farm-select'
  && response.interaction.request.farm.farmType === 'room'

const buildRooms = (session: GameSession, count: number) => {
  const selection = openRoomSelection(session)
  expect(isRoomSelection(selection)).toBe(true)
  if (selection.interaction.stateId !== 'wait'
    || selection.interaction.request.kind !== 'farm-select') return selection
  const rooms = selection.interaction.request.farm.selectableTiles.slice(0, count)
  expect(rooms).toHaveLength(count)
  return session.commitSelectionChoice(selection.interaction.playerIndex, { rooms })
}

const improvementLog = (response: SessionResponse, key: string) =>
  response.state.log.find((row) => row.key === key)

describe('CUSTOM_MedievalMallet session', () => {
  it('S1: a wooden room costs 3 wood and 2 reed', () => {
    const response = buildRooms(setup({ resources: { wood: 3, reed: 2 } }), 1)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0 })
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
  })

  it('S2: the discount applies to every room built in the same action', () => {
    const response = buildRooms(setup({ resources: { wood: 6, reed: 4 } }), 2)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(4)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0 })
  })

  it('S3: the discount is exactly 2 wood, so 2 wood cannot pay for a wooden room', () => {
    const response = openRoomSelection(setup({ resources: { wood: 2, reed: 2 } }))

    expect(isRoomSelection(response)).toBe(false)
    expect(response.state.players[0]!.rooms).toBe(2)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, reed: 2 })
  })

  it('S4: a clay room has no wood to discount and still costs 5 clay and 2 reed', () => {
    const response = buildRooms(setup({ houseType: 'clay', resources: { clay: 5, reed: 2 } }), 1)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, reed: 0, wood: 0 })
  })

  it('S5: Joinery costs 2 stone instead of 2 wood and 2 stone', () => {
    const response = setup({ resources: { stone: 2 }, majors: ['Major_Joinery'] })
      .takeAction(0, 'major-improvement')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain('Major_Joinery')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, stone: 0 })
    expect(improvementLog(response, 'log.playImprovement')?.params).toMatchObject({
      costResources: { stone: 2 },
      bonusSources: [CARD_ID],
    })
  })

  it('S6: the discount is capped at the printed wood cost (Well: 1 wood, 3 stone)', () => {
    const response = setup({ resources: { wood: 1, stone: 3 }, majors: ['Major_Well'] })
      .takeAction(0, 'major-improvement')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain('Major_Well')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, stone: 0 })
    expect(improvementLog(response, 'log.playImprovement')?.params).toMatchObject({
      costResources: { stone: 3 },
      bonusSources: [CARD_ID],
    })
  })

  it('S7: a minor improvement with a wood cost is discounted too (Manger: 2 wood)', () => {
    const response = setup({ resources: { wood: 2 }, minorHand: ['A032_Manger'] })
      .takeAction(0, 'major-improvement')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toEqual([CARD_ID, 'A032_Manger'])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2 })
    expect(improvementLog(response, 'log.playMinorImprovement')?.params?.bonusSources).toEqual([CARD_ID])
  })

  it('S8: an improvement without wood in its cost is unchanged (Basketmaker: 2 reed, 2 stone)', () => {
    const response = setup({ resources: { reed: 2, stone: 2 }, majors: ['Major_Basket'] })
      .takeAction(0, 'major-improvement')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain('Major_Basket')
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 0, stone: 0 })
    expect(improvementLog(response, 'log.playImprovement')?.params?.bonusSources ?? []).not.toContain(CARD_ID)
  })

  it('S9: without the card in play, rooms and improvements pay the printed wood cost', () => {
    const room = buildRooms(setup({ played: false, resources: { wood: 5, reed: 2 } }), 1)
    expect(room.ok, room.error).toBe(true)
    expect(room.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0 })

    const minor = setup({ played: false, resources: { wood: 2 }, minorHand: ['A032_Manger'] })
      .takeAction(0, 'major-improvement')
    expect(minor.ok, minor.error).toBe(true)
    expect(minor.state.players[0]!.minorPlayed).toEqual(['A032_Manger'])
    expect(minor.state.players[0]!.resources).toMatchObject({ wood: 0 })
  })
})
