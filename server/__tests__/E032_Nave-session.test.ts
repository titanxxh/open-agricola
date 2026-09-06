import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E032_Nave'

const CARD_ID = 'E032_Nave'
const FILLER = '__test_placeholder__'

const setup = ({
  played = false, stone = 2, reed = 1, roomTiles = [{ row: 0, col: 0 }, { row: 1, col: 0 }],
}: {
  played?: boolean
  stone?: number
  reed?: number
  roomTiles?: { row: number; col: number }[]
} = {}) => {
  const session = new GameSession(7032, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
  })
  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [CARD_ID, FILLER]
  player.minorPlayed = played ? [CARD_ID] : []
  player.rooms = roomTiles.length
  player.roomTiles = roomTiles
  Object.assign(player.resources, {
    wood: 0, clay: 0, reed, stone, food: 20, grain: 0, vegetable: 0,
  })
  session.loadState(state)
  return session
}

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  if (!response.interaction.request.options?.some((option) => option.value === CARD_ID)) {
    const branch = response.interaction.request.options?.find((option) =>
      option.value.startsWith('action-improvement-'))
    if (branch) response = session.resolveChoice(response.interaction.playerIndex, branch.value)
  }
  return response
}

const play = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const offered = (response: SessionResponse) => response.interaction.stateId === 'wait'
  && (response.interaction.request.options?.some((option) => option.value === CARD_ID) ?? false)

const naveBonus = (response: SessionResponse) => response.scores[0]!.categories
  .find((category) => category.key === 'cardBonusVp')?.entries
  .find((entry) => entry.cardId === CARD_ID)?.score ?? 0

describe('E032 Nave parity', () => {
  it('E032 S1: paying two stone and one reed plays Nave', () => {
    const response = play(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 0, reed: 0 })
  })

  it('E032 S2: one stone is insufficient to play Nave', () => {
    const response = enterMinor(setup({ stone: 1 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 1, reed: 1 })
  })

  it('E032 S3: no reed is insufficient to play Nave', () => {
    const response = enterMinor(setup({ reed: 0 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.stone).toBe(2)
  })

  it('E032 S4: multiple rooms in one farmyard column score one bonus point', () => {
    const response = setup({
      played: true,
      roomTiles: [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }],
    }).getState()

    expect(naveBonus(response)).toBe(1)
  })

  it('E032 S5: rooms across three farmyard columns score three bonus points', () => {
    const response = setup({
      played: true,
      roomTiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }],
    }).getState()

    expect(naveBonus(response)).toBe(3)
  })

  it('E032 S6: rooms in all five farmyard columns score five bonus points', () => {
    const response = setup({
      played: true,
      roomTiles: Array.from({ length: 5 }, (_, col) => ({ row: 0, col })),
    }).getState()

    expect(naveBonus(response)).toBe(5)
  })
})
