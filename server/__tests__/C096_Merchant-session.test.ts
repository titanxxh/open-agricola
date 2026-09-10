import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/C/C096_Merchant'
import '../../shared/cards/C/C069_LandConsolidation'
import '../../shared/cards/A/A068_AsparagusGift'

const CARD_ID = 'C096_Merchant'

const FIRST_MINOR = 'C069_LandConsolidation'

const SECOND_MINOR = 'A068_AsparagusGift'

const MAJOR_ID = 'Major_Fireplace1'

const FILLER = '__test_placeholder__'

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const setup = ({ played = true, food = 1, minors = [] as string[], field = false } = {}) => {
  const session = new GameSession(6096, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = [MAJOR_ID]
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.fields = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.minorHand = minors.length > 0 ? minors : [FILLER]
  owner.resources.food = food
  owner.resources.clay = 2
  owner.fields = field ? [{ row: 0, col: 2, stacks: [] }] : []
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) => option.value === CARD_ID)
  expect(card, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, card!.value)
}

const chooseImprovement = (
  session: GameSession, start: SessionResponse, cardId: string,
) => {
  let response = start
  for (let guard = 0; guard < 5 && response.interaction.stateId === 'wait'; guard += 1) {
    const player = response.state.players[0]!
    if (player.improvements.includes(cardId) || player.minorPlayed.includes(cardId)) break
    const card = options(response).find((option) => option.value === cardId)
    if (card) {
      response = session.resolveChoice(response.interaction.playerIndex, card.value)
      continue
    }
    const enter = options(response).find((option) => option.value.startsWith('action-improvement-'))
    if (!enter) break
    response = session.resolveChoice(response.interaction.playerIndex, enter.value)
  }
  return response
}

const acceptMerchant = (session: GameSession, start: SessionResponse) => {
  let response = start
  for (let guard = 0; guard < 4 && response.interaction.stateId === 'wait'; guard += 1) {
    if (response.interaction.promptKey !== 'ui.interactionMerchantPrompt'
      && response.interaction.sourceCard !== CARD_ID) break
    const accept = options(response).find((option) => option.value !== '__skip__')
    expect(accept, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, accept!.value)
  }
  return response
}

describe('C096 Merchant parity', () => {
  it('C096 S1: Merchant is played as the first occupation', () => {
    const response = playOccupation(setup({ played: false, food: 0 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('C096 S2: after a Major or Minor Improvement action one food buys a second improvement action', () => {
    const session = setup({ minors: [FIRST_MINOR] })
    let response = chooseImprovement(session, session.takeAction(0, 'major-improvement'), MAJOR_ID)
    response = chooseImprovement(session, acceptMerchant(session, response), FIRST_MINOR)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain(MAJOR_ID)
    expect(response.state.players[0]!.minorPlayed).toContain(FIRST_MINOR)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('C096 S3: after a Minor Improvement action the second action remains minor-only', () => {
    const session = setup({ minors: [FIRST_MINOR, SECOND_MINOR], field: true })
    let response = chooseImprovement(session, session.takeAction(0, 'meeting-place'), FIRST_MINOR)
    response = acceptMerchant(session, response)

    expect(options(response).map((option) => option.value)).not.toContain(MAJOR_ID)
    response = chooseImprovement(session, response, SECOND_MINOR)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toEqual(expect.arrayContaining([
      FIRST_MINOR, SECOND_MINOR,
    ]))
    expect(response.state.players[0]!.improvements).not.toContain(MAJOR_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('C096 S4: declining Merchant keeps the food and builds only the first improvement', () => {
    const session = setup({ minors: [FIRST_MINOR] })
    let response = chooseImprovement(session, session.takeAction(0, 'major-improvement'), MAJOR_ID)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId === 'wait') {
      expect(options(response).map((option) => option.value)).toContain('__skip__')
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain(MAJOR_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(FIRST_MINOR)
    expect(response.state.players[0]!.resources.food).toBe(1)
  })
})
