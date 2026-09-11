import { GameSession, type SessionResponse } from '../../game/authoritative-session'
import { setWorkersAtHome } from '../../../shared/domain/player'
import { resolveTriggerIfPresent } from './trigger-select'
import { stabilizeRandomHands } from './stabilize-random-hands'

const FILLER = '__test_placeholder__'

export const sessionOptions = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

export const setupMinorSession = ({
  cardId, resources, improvements = [], minorPlayed = [], houseType = 'wood',
}: {
  cardId: string
  resources: Partial<Record<'wood' | 'clay' | 'reed' | 'stone' | 'grain', number>>
  improvements?: string[]
  minorPlayed?: string[]
  houseType?: 'wood' | 'clay' | 'stone'
}) => {
  const session = new GameSession(9701)
  stabilizeRandomHands(session.state.players)
  const state = session.state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const player = state.players[0]!
  player.minorHand = [cardId]
  player.improvements = improvements
  player.minorPlayed = minorPlayed
  player.houseType = houseType
  Object.assign(player.resources, resources)
  session.loadState(state)
  return session
}

export const playMinor = (session: GameSession, cardId: string) => {
  let response = session.takeAction(0, 'meeting-place')
  for (let guard = 0; guard < 8 && response.state.players[0]!.minorHand.includes(cardId); guard += 1) {
    if (response.interaction.stateId !== 'wait') break
    const card = sessionOptions(response).find((option) =>
      option.value === cardId || option.value === `minor:${cardId}`)
    const branch = sessionOptions(response).find((option) =>
      option.value.startsWith('action-improvement-'))
    const next = card ?? branch
    if (!next) break
    response = session.resolveChoice(response.interaction.playerIndex, next.value)
    if (response.interaction.stateId === 'wait' && response.interaction.promptKey === 'prompt.selectPayment') {
      const payment = sessionOptions(response).find((option) => option.value !== 'cancel')
      if (!payment) break
      response = session.resolveChoice(response.interaction.playerIndex, payment.value)
    }
  }
  return response
}

export const setupOccupationSession = ({
  cardId, round = 5, playerCount = 2, played = [], hand = [cardId], food = 0,
}: {
  cardId: string
  round?: number
  playerCount?: number
  played?: string[]
  hand?: string[]
  food?: number
}) => {
  const session = new GameSession(9702 + round, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.state
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
    player.improvements = []
    player.cardStates = {}
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const player = state.players[0]!
  player.occupationHand = hand
  player.occupationPlayed = played
  player.resources.food = food
  session.loadState(state)
  return session
}

export const playOccupation = (session: GameSession, cardId: string) => {
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId === 'wait') {
    const card = sessionOptions(response).find((option) => option.value === cardId)
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  }
  return resolveTriggerIfPresent(session, response, 'B100_Clutterer')
}
