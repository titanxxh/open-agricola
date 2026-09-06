import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E013_StoneHouseReconstruction'

const CARD_ID = 'E013_StoneHouseReconstruction'
const ANYTIME_ID = 'E13-stone-house-reconstruction-anytime'
const FILLER = '__test_placeholder__'

const roomTiles = (count: number) => [
  ...Array.from({ length: Math.min(count, 5) }, (_, col) => ({ row: 0, col })),
  ...Array.from({ length: Math.max(0, count - 5) }, (_, col) => ({ row: 1, col })),
]

const setup = ({
  played = false,
  houseType = 'clay' as 'wood' | 'clay' | 'stone',
  rooms = 2,
  stone = 1,
  reed = 0,
} = {}) => {
  const session = new GameSession(7013, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID]
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.houseType = houseType
  owner.rooms = rooms
  owner.roomTiles = roomTiles(rooms)
  owner.resources.stone = stone
  owner.resources.reed = reed
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  if (!options(response).some((option) => option.value === CARD_ID)) {
    const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
    if (branch) response = session.resolveChoice(response.interaction.playerIndex, branch.value)
  }
  return response
}

const play = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const enterActiveInteraction = (session: GameSession) => {
  const response = session.takeAction(0, 'farmland')
  expect(response.ok, response.error).toBe(true)
  return response
}

const anytimeOffered = (response: SessionResponse) =>
  response.interaction.anytimeActions.some((action) => action.id === ANYTIME_ID)

const useReconstruction = (session: GameSession) => {
  const active = enterActiveInteraction(session)
  expect(anytimeOffered(active)).toBe(true)
  const response = session.takeAnytimeAction(0, ANYTIME_ID)
  expect(response.ok, response.error).toBe(true)
  return response
}

describe('E013 Stone House Reconstruction parity', () => {
  it('E013 S1: paying one stone plays Stone House Reconstruction and scores one point', () => {
    const response = play(setup({ played: false, houseType: 'wood', stone: 1, reed: 0 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.stone).toBe(0)
    expect(response.scores[0]!.categories.find((category) => category.key === 'cards')?.entries)
      .toContainEqual(expect.objectContaining({ cardId: CARD_ID, score: 1 }))
  })

  it('E013 S2: without one stone Stone House Reconstruction remains unavailable', () => {
    const response = enterMinor(setup({
      played: false, houseType: 'wood', stone: 0, reed: 0,
    }))

    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.stone).toBe(0)
  })

  it('E013 S3: a two-room clay house can renovate at anytime for two stone and one reed', () => {
    const response = useReconstruction(setup({
      played: true, rooms: 2, stone: 2, reed: 1,
    }))

    expect(response.state.players[0]).toMatchObject({
      houseType: 'stone',
      rooms: 2,
      resources: { stone: 0, reed: 0 },
    })
  })

  it('E013 S4: a wood house does not offer Stone House Reconstruction at anytime', () => {
    const session = setup({ played: true, houseType: 'wood', stone: 2, reed: 1 })
    const response = enterActiveInteraction(session)

    expect(anytimeOffered(response)).toBe(false)
    expect(session.takeAnytimeAction(0, ANYTIME_ID).ok).toBe(false)
    expect(response.state.players[0]!.houseType).toBe('wood')
  })

  it('E013 S5: a stone house does not offer Stone House Reconstruction at anytime', () => {
    const session = setup({ played: true, houseType: 'stone', stone: 2, reed: 1 })
    const response = enterActiveInteraction(session)

    expect(anytimeOffered(response)).toBe(false)
    expect(session.takeAnytimeAction(0, ANYTIME_ID).ok).toBe(false)
    expect(response.state.players[0]!.houseType).toBe('stone')
  })

  it('E013 S6: a clay house lacking stone or reed does not offer the anytime renovation', () => {
    for (const resources of [{ stone: 1, reed: 1 }, { stone: 2, reed: 0 }]) {
      const session = setup({ played: true, rooms: 2, ...resources })
      const response = enterActiveInteraction(session)

      expect(anytimeOffered(response)).toBe(false)
      expect(session.takeAnytimeAction(0, ANYTIME_ID).ok).toBe(false)
      expect(response.state.players[0]!.houseType).toBe('clay')
    }
  })

  it('E013 S7: a three-room clay house pays three stone and one reed to renovate', () => {
    const response = useReconstruction(setup({
      played: true, rooms: 3, stone: 3, reed: 1,
    }))

    expect(response.state.players[0]).toMatchObject({
      houseType: 'stone',
      rooms: 3,
      resources: { stone: 0, reed: 0 },
    })
    expect(response.state.players[0]!.roomTiles).toHaveLength(3)
  })

  it('E013 S8: after a successful renovation the anytime entry disappears and its temporary flag is cleared', () => {
    const response = useReconstruction(setup({
      played: true, rooms: 2, stone: 2, reed: 1,
    }))

    expect(anytimeOffered(response)).toBe(false)
    expect(isCardFlagged(response.state.players[0]!, CARD_ID)).toBe(false)
    expect(response.state.players[0]!.houseType).toBe('stone')
  })

  it('E013 S9: the final pre-scoring window still allows the paid renovation without a person', () => {
    const session = setup({ played: true, rooms: 2, stone: 2, reed: 1 })
    const state = session.getState().state
    state.players.forEach((player) => markAllWorkersUsed(state, player))
    state.players[0]!.startPlayer = true
    state.players[1]!.startPlayer = false
    session.loadState(state)

    let response = session.performRoundEnd()
    if (session.peekEnginePendingEnvelope()?.syntheticKind === 'post-reap-anytime') {
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'feed') {
      response = session.resolveChoice(response.interaction.playerIndex, 'confirm', { selections: [] })
    }
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected pre-scoring window')
    expect(response.interaction.request.kind).toBe('choice')
    const reconstruction = response.interaction.request.options?.find((option) =>
      option.sourceCard === CARD_ID && option.value !== '__skip__')
    expect(reconstruction, JSON.stringify(response.interaction)).toBeDefined()

    response = session.resolveChoice(response.interaction.playerIndex, reconstruction!.value)

    expect(response.state.players[0]).toMatchObject({
      houseType: 'stone',
      rooms: 2,
      resources: { stone: 0, reed: 0 },
    })
    expect(isCardFlagged(response.state.players[0]!, CARD_ID)).toBe(false)
  })
})
