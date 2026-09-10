import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/C/C035_LanternHouse'
import '../../shared/cards/B/B146_Illusionist'

const CARD_ID = 'C035_LanternHouse'

const FILLER = '__test_placeholder__'

const setup = ({
  played = false, occupations = 0, handCards = 1, round = 14, scoring = false,
}: {
  played?: boolean
  occupations?: number
  handCards?: number
  round?: number
  scoring?: boolean
} = {}) => {
  const session = new GameSession(6035, undefined, { playerCount: 3 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
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
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })

  const owner = state.players[0]!
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.minorHand = played
    ? Array.from({ length: handCards }, () => FILLER)
    : [CARD_ID]
  owner.occupationHand = played && handCards > 0 ? [FILLER] : [FILLER]
  if (played && handCards > 0) {
    owner.minorHand = Array.from({ length: Math.max(0, handCards - 1) }, () => FILLER)
  }
  owner.occupationPlayed = Array.from({ length: occupations }, (_, index) =>
    ['A100_Curator', 'A125_Priest'][index]!)
  owner.resources.wood = played ? 0 : 1

  if (scoring) {
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 0)
    })
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
  if (!options(response).some((option) => option.value === CARD_ID)) {
    const improvement = options(response).find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  }
  return response
}

const playMinor = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) =>
    option.value === CARD_ID || option.value === `minor:${CARD_ID}`)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const finishGame = (session: GameSession) => {
  let response = session.performRoundEnd()
  for (let guard = 0; guard < 40 && response.interaction.stateId === 'wait'; guard += 1) {
    const interaction = response.interaction
    if (interaction.request.kind === 'feed') {
      response = session.resolveChoice(interaction.playerIndex, 'confirm', { selections: [] })
      continue
    }
    const next = interaction.request.options?.find((option) => option.value === '__done__')
      ?? interaction.request.options?.find((option) => option.value === '__skip__')
      ?? interaction.request.options?.[0]
    if (!next) break
    response = session.resolveChoice(interaction.playerIndex, next.value)
  }
  return response
}

describe('C035 Lantern House parity', () => {
  it('C035 S1: no occupation and one wood allow Lantern House to be played', () => {
    const response = playMinor(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('C035 S2: an occupation keeps Lantern House unavailable', () => {
    const response = enterMinor(setup({ occupations: 1 }))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(options(response).some((option) =>
      option.value === CARD_ID || option.value === `minor:${CARD_ID}`)).toBe(false)
  })

  it('C035 S3: three cards left in hand score seven printed points minus three', () => {
    const response = finishGame(setup({ played: true, handCards: 3, scoring: true }))
    const cards = response.scores[0]!.categories.find((category) => category.key === 'cards')
    const bonus = response.scores[0]!.categories.find((category) => category.key === 'cardBonusVp')

    expect(response.state.gameOver).toBe(true)
    expect(cards?.entries).toContainEqual(expect.objectContaining({ cardId: CARD_ID, score: 7 }))
    expect(bonus?.entries).toContainEqual(expect.objectContaining({ cardId: CARD_ID, score: -3 }))
  })

  it('C035 S4: Lantern House prevents Illusionist from discarding a hand card at Forest', () => {
    const session = setup({ played: true, handCards: 1 })
    const state = session.getState().state
    const owner = state.players[0]!
    owner.occupationPlayed.push('B146_Illusionist')
    owner.minorHand = [FILLER]
    state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 3
    session.loadState(state)

    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(3)
    expect(response.state.players[0]!.minorHand).toEqual([FILLER])
    expect(options(response).some((option) => option.sourceCard === 'B146_Illusionist')).toBe(false)
  })
})
