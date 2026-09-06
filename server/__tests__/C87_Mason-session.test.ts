import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import {
  isCardFlagged, readCardExtraData, setCardFlag, writeCardExtraData,
} from '../../shared/cards/helpers/card-state'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C087_Mason'

const CARD_ID = 'C087_Mason'
const ANYTIME_ID = 'C87-mason-anytime'
const FILLER = '__test_placeholder__'

const roomTiles = (count: number) => [
  ...Array.from({ length: Math.min(count, 5) }, (_, col) => ({ row: 0, col })),
  ...Array.from({ length: Math.max(0, count - 5) }, (_, col) => ({ row: 1, col })),
]

const setup = ({
  played = true,
  houseType = 'stone' as 'wood' | 'clay' | 'stone',
  rooms = 4,
  flagged = false,
} = {}) => {
  const session = new GameSession(5087, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0,
      food: index === 0 ? 0 : 20, grain: 0, vegetable: 0, sheep: 0, boar: 0,
      cattle: 0, begging: 0,
    }
    setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID, FILLER]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.houseType = houseType
  owner.rooms = rooms
  owner.roomTiles = roomTiles(rooms)
  if (played) writeCardExtraData(owner, CARD_ID, 'hasRoom', true)
  if (flagged) setCardFlag(owner, CARD_ID, true)
  session.loadState(state)
  return session
}

const playMason = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (response.state.players[0]!.occupationHand.includes(CARD_ID)) {
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    const option = response.interaction.request.options?.find((entry) => entry.value === CARD_ID)
    expect(option, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, option!.value)
  }
  return response
}

const enterActiveInteraction = (session: GameSession) => {
  const response = session.takeAction(0, 'farmland')
  expect(response.ok, response.error).toBe(true)
  return response
}

const anytimeIds = (response: SessionResponse) => response.interaction.anytimeActions
  .map((action) => action.id)

describe('C087 Mason parity', () => {
  it('C087 S1: playing Mason places one stone room on the card', () => {
    const response = playMason(setup({ played: false, houseType: 'wood', rooms: 2 }))
    const owner = response.state.players[0]!

    expect(response.ok, response.error).toBe(true)
    expect(owner.occupationPlayed).toContain(CARD_ID)
    expect(readCardExtraData<boolean>(owner, CARD_ID, 'hasRoom')).toBe(true)
    expect(owner.rooms).toBe(2)
  })

  it('C087 S2: a four-room stone house can add the held room for free once', () => {
    const session = setup()
    const initial = enterActiveInteraction(session)
    expect(anytimeIds(initial)).toContain(ANYTIME_ID)

    const offered = session.takeAnytimeAction(0, ANYTIME_ID)
    expect(offered.ok, offered.error).toBe(true)
    expect(offered.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select' } })
    const built = session.commitSelectionChoice(0, { rooms: [{ row: 0, col: 4 }] })

    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.rooms).toBe(5)
    expect(built.state.players[0]!.roomTiles).toContainEqual({ row: 0, col: 4 })
    expect(built.state.players[0]!.resources).toMatchObject({
      wood: 0, clay: 0, reed: 0, stone: 0,
    })
    expect(isCardFlagged(built.state.players[0]!, CARD_ID)).toBe(true)
    expect(anytimeIds(built)).not.toContain(ANYTIME_ID)
  })

  it('C087 S3: Mason is unavailable in a four-room wood house', () => {
    const response = enterActiveInteraction(setup({ houseType: 'wood' }))

    expect(anytimeIds(response)).not.toContain(ANYTIME_ID)
  })

  it('C087 S4: Mason is unavailable in a four-room clay house', () => {
    const response = enterActiveInteraction(setup({ houseType: 'clay' }))

    expect(anytimeIds(response)).not.toContain(ANYTIME_ID)
  })

  it('C087 S5: Mason is unavailable with only three stone rooms', () => {
    const response = enterActiveInteraction(setup({ rooms: 3 }))

    expect(anytimeIds(response)).not.toContain(ANYTIME_ID)
  })

  it('C087 S6: Mason remains unavailable after its one-time room was already used', () => {
    const response = enterActiveInteraction(setup({ rooms: 5, flagged: true }))

    expect(anytimeIds(response)).not.toContain(ANYTIME_ID)
  })
})
