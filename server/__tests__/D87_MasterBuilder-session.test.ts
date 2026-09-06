import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D087_MasterBuilder'

const CARD_ID = 'D087_MasterBuilder'
const ANYTIME_ID = 'D87-master-builder-anytime'
const FILLER = '__test_placeholder__'

const roomTiles = (count: number) => [
  ...Array.from({ length: Math.min(count, 5) }, (_, col) => ({ row: 0, col })),
  ...Array.from({ length: Math.max(0, count - 5) }, (_, col) => ({ row: 1, col })),
]

const setup = ({
  played = true, rooms = 5, houseType = 'wood', used = false,
}: {
  played?: boolean
  rooms?: number
  houseType?: 'wood' | 'clay'
  used?: boolean
} = {}) => {
  const session = new GameSession(6087, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })

  const player = state.players[0]!
  player.occupationHand = played ? [FILLER] : [CARD_ID]
  player.occupationPlayed = played ? [CARD_ID] : []
  player.resources.food = 0
  player.rooms = rooms
  player.roomTiles = roomTiles(rooms)
  player.houseType = houseType
  if (used) player.cardStates[CARD_ID] = { flagged: true }
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  const card = options(response).find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const enterAnytimeWindow = (session: GameSession) => session.takeAction(0, 'farmland')

const hasAnytime = (response: SessionResponse) =>
  response.interaction.anytimeActions.some((action) => action.id === ANYTIME_ID)

const useMasterBuilder = (session: GameSession) => {
  const offered = enterAnytimeWindow(session)
  expect(hasAnytime(offered)).toBe(true)
  const response = session.takeAnytimeAction(0, ANYTIME_ID)
  expect(response.interaction).toMatchObject({
    stateId: 'wait',
    request: { kind: 'farm-select', farm: { farmType: 'room', maxSelections: 1 } },
  })
  return response
}

const commitFirstRoom = (session: GameSession, response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') {
    return response
  }
  const room = response.interaction.request.farm.selectableTiles[0]
  expect(room).toBeDefined()
  return session.commitSelectionChoice(response.interaction.playerIndex, { rooms: [room!] })
}

describe('D087 Master Builder parity', () => {
  it('D087 S1: Master Builder can be played as the first occupation through Lessons', () => {
    const response = playOccupation(setup({ played: false, rooms: 2 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('D087 S2: Master Builder is unavailable with fewer than five rooms', () => {
    const response = enterAnytimeWindow(setup({ rooms: 4 }))

    expect(hasAnytime(response)).toBe(false)
    expect(response.state.players[0]!.rooms).toBe(4)
  })

  it('D087 S3: five rooms allow one free room and consume the once-per-game effect', () => {
    const session = setup()
    const response = commitFirstRoom(session, useMasterBuilder(session))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(6)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, reed: 0, stone: 0 })
    expect(isCardFlagged(response.state.players[0]!, CARD_ID)).toBe(true)
    expect(hasAnytime(response)).toBe(false)
  })

  it('D087 S4: a previously used Master Builder is unavailable even with five rooms', () => {
    const response = enterAnytimeWindow(setup({ used: true }))

    expect(hasAnytime(response)).toBe(false)
    expect(response.state.players[0]!.rooms).toBe(5)
  })

  it('D087 S5: the free construction allows at most one room', () => {
    const session = setup()
    const offered = useMasterBuilder(session)

    expect(offered.interaction.stateId === 'wait' && offered.interaction.request.kind === 'farm-select'
      ? offered.interaction.request.farm.maxSelections
      : undefined).toBe(1)

    const response = commitFirstRoom(session, offered)
    expect(response.state.players[0]!.rooms).toBe(6)
    expect(isCardFlagged(response.state.players[0]!, CARD_ID)).toBe(true)
  })

  it('D087 S6: a five-room clay house gains a clay room without paying clay or reed', () => {
    const session = setup({ houseType: 'clay' })
    const response = commitFirstRoom(session, useMasterBuilder(session))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!).toMatchObject({ rooms: 6, houseType: 'clay' })
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, reed: 0 })
  })
})
