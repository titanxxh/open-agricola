import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { A014_CarpentersHammer } from '../../shared/cards/A/A014_CarpentersHammer'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

const CARD_ID = 'A014_CarpentersHammer'

const FILLER = '__test_placeholder__'

const setup = ({
  played = true,
  houseType = 'wood' as 'wood' | 'clay' | 'stone',
  resources = {},
}: {
  played?: boolean
  houseType?: 'wood' | 'clay' | 'stone'
  resources?: Partial<Record<'wood' | 'clay' | 'reed' | 'stone', number>>
} = {}) => {
  const session = new GameSession(6014, undefined, { playerCount: 2 })
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
  })
  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [CARD_ID]
  player.minorPlayed = played ? [CARD_ID] : []
  player.activeModifiers = played ? [...(A014_CarpentersHammer.impl.modifiers ?? [])] : []
  player.houseType = houseType
  player.resources = {
    ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
    vegetable: 0, sheep: 0, boar: 0, cattle: 0, ...resources,
  }
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const playCard = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  if (!options(response).some((option) => option.value === CARD_ID)) {
    const improvement = options(response).find((option) => option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  }
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  const card = options(response).find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, card!.value)
}

const buildRooms = (session: GameSession, count: number) => {
  let response = session.takeAction(0, 'farm-expansion')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  if (response.interaction.request.farm?.farmType !== 'room') {
    const construct = response.interaction.request.options?.find(
      (option) => option.labelKey === 'actions.construct.name',
    )
    expect(construct).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, construct!.value)
  }
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  expect(response.interaction.request.farm?.farmType).toBe('room')
  const rooms = response.interaction.request.farm?.selectableTiles.slice(0, count) ?? []
  expect(rooms).toHaveLength(count)
  return session.commitSelectionChoice(response.interaction.playerIndex, { rooms })
}

describe("A014 Carpenter's Hammer parity", () => {
  it("A014 S1: paying one wood plays Carpenter's Hammer", () => {
    const response = playCard(setup({ played: false, resources: { wood: 1 } }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.activeModifiers.filter((modifier) => modifier.cardId === CARD_ID)).toHaveLength(4)
  })

  it('A014 S2: building two wood rooms receives the total two wood and two reed discount', () => {
    const response = buildRooms(setup({ resources: { wood: 8, reed: 2 } }), 2)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'wood', rooms: 4, resources: { wood: 0, reed: 0 },
    })
  })

  it('A014 S3: building two clay rooms receives the total three clay and two reed discount', () => {
    const response = buildRooms(setup({ houseType: 'clay', resources: { clay: 7, reed: 2 } }), 2)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay', rooms: 4, resources: { clay: 0, reed: 0 },
    })
  })

  it('A014 S4: building two stone rooms receives the total four stone and two reed discount', () => {
    const response = buildRooms(setup({ houseType: 'stone', resources: { stone: 6, reed: 2 } }), 2)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'stone', rooms: 4, resources: { stone: 0, reed: 0 },
    })
  })

  it('A014 S5: building only one room pays the undiscounted room cost', () => {
    const response = buildRooms(setup({ resources: { wood: 5, reed: 2 } }), 1)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'wood', rooms: 3, resources: { wood: 0, reed: 0 },
    })
  })
})
