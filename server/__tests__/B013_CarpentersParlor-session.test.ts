import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/B/B013_CarpentersParlor'

const CARD_ID = 'B013_CarpentersParlor'

const FILLER = '__test_placeholder__'

const setup = ({
  played = true, houseType = 'wood' as 'wood' | 'clay' | 'stone', resources = {},
}: {
  played?: boolean
  houseType?: 'wood' | 'clay' | 'stone'
  resources?: Partial<Record<'wood' | 'clay' | 'reed' | 'stone', number>>
} = {}) => {
  const session = new GameSession(6013, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID]
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.houseType = houseType
  owner.resources = {
    ...owner.resources,
    ...(played ? {} : { wood: 1, stone: 1 }),
    ...resources,
  }
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
  if (response.interaction.stateId === 'wait'
    && response.interaction.promptKey === 'prompt.selectPayment') {
    const payment = options(response).find((option) =>
      option.value.startsWith(`pay:improvement:minor:${CARD_ID}:`))
    expect(payment).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, payment!.value)
  }
  return response
}

const openRoomSelection = (session: GameSession) => {
  let response = session.takeAction(0, 'farm-expansion')
  if (response.interaction.stateId === 'wait') {
    const construct = options(response).find((option) => option.labelKey === 'actions.construct.name')
    if (construct) response = session.resolveChoice(response.interaction.playerIndex, construct.value)
  }
  expect(response.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'room' } },
  })
  return response
}

const buildOneRoom = (session: GameSession) => {
  const selection = openRoomSelection(session)
  if (selection.interaction.stateId !== 'wait'
    || selection.interaction.request.kind !== 'farm-select') return selection
  const room = selection.interaction.request.farm.selectableTiles[0]
  expect(room).toBeDefined()
  return session.commitSelectionChoice(selection.interaction.playerIndex, { rooms: [room!] })
}

describe('B013 Carpenter\'s Parlor parity', () => {
  it('B013 S1: paying one wood and one stone plays Carpenter\'s Parlor', () => {
    const response = playMinor(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, stone: 0 })
  })

  it('B013 S2: lacking stone keeps Carpenter\'s Parlor unavailable without spending wood', () => {
    const response = enterMinor(setup({ played: false, resources: { stone: 0 } }))

    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it('B013 S3: a wooden room costs exactly two wood and two reed', () => {
    const response = buildOneRoom(setup({ resources: { wood: 2, reed: 2 } }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0 })
  })

  it('B013 S4: a clay room still costs the normal five clay and two reed', () => {
    const response = buildOneRoom(setup({
      houseType: 'clay', resources: { clay: 5, reed: 2 },
    }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, reed: 0 })
  })

  it('B013 S5: a stone room still costs the normal five stone and two reed', () => {
    const response = buildOneRoom(setup({
      houseType: 'stone', resources: { stone: 5, reed: 2 },
    }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 0, reed: 0 })
  })
})
