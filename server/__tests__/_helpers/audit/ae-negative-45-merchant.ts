// Helpers of ae-negative-45-merchant-session.test.ts from the negative audit snapshot fafd4f51b.
import fs from '../audit-evidence-fs'
import { expect, it as nativeIt } from 'vitest'
import '../../../../shared/cards/A/A068_AsparagusGift'
import '../../../../shared/cards/C/C069_LandConsolidation'
import '../../../../shared/cards/C/C096_Merchant'
import type { ActionChoiceOption } from '../../../../shared/contract/types'
import { setWorkersAtHome } from '../../../../shared/domain/player'
import { GameSession, type SessionResponse } from '../../../game/authoritative-session'
import { createWorkSession } from '../session-fixtures'

export const CARD_ID = 'C096_Merchant'
export const FIRST_MINOR = 'C069_LandConsolidation'
export const SECOND_MINOR = 'A068_AsparagusGift'
export const MAJOR_ID = 'Major_Fireplace1'
export const FILLER = '__test_placeholder__'
export const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? optionsOf(response) ?? []
  : []
export const setup = ({ played = true, food = 1, minors = new Array<string>(), field = false } = {}) => {
  const session = createWorkSession({ seed: 6096, options: { playerCount: 4 }, configure(state) {
      state.currentPlayerIndex = 0
      state.round = 14
      state.roundPhase = 'work'
      state.availableMajorImprovements = [MAJOR_ID]
      state.actionSpaces.forEach((space) => { space.takenBy = []; })
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
    } })
  sessions.push(session)
  return session
}
export const playOccupation = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID))
    return response
  if (response.interaction.stateId !== 'wait')
    return response
  const card = options(response).find((option) => option.value === CARD_ID)
  expect(card, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(actorOf(response), card!.value)
}
export const chooseImprovement = (session: GameSession, start: SessionResponse, cardId: string) => {
  let response = start
  for (let guard = 0; guard < 5 && response.interaction.stateId === 'wait'; guard += 1) {
    const player = response.state.players[0]!
    if (player.improvements.includes(cardId) || player.minorPlayed.includes(cardId))
      break
    const card = options(response).find((option) => option.value === cardId)
    if (card) {
      response = session.resolveChoice(actorOf(response), card.value)
      continue
    }
    const enter = options(response).find((option) => option.value.startsWith('action-improvement-'))
    if (!enter)
      break
    response = session.resolveChoice(actorOf(response), enter.value)
  }
  return response
}
export const acceptMerchant = (session: GameSession, start: SessionResponse) => {
  let response = start
  for (let guard = 0; guard < 4 && response.interaction.stateId === 'wait'; guard += 1) {
    if (response.interaction.promptKey !== 'ui.interactionMerchantPrompt'
      && response.interaction.sourceCard !== CARD_ID)
      break
    const accept = options(response).find((option) => option.value !== '__skip__')
    expect(accept, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(actorOf(response), accept!.value)
  }
  return response
}
export const sessions: GameSession[] = []
export function it(name: string, run: () => void) {
  nativeIt(name, () => {
    run()
    const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/45-capture'
    fs.mkdirSync(output, { recursive: true })
    fs.writeFileSync(`${output}/${name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`, JSON.stringify(sessions.map(session => {
      const r = session.getState()
      return { players: r.state.players.map(p => ({ resources: p.resources, rooms: p.rooms, house: p.houseType, workers: p.workers, minorPlayed: p.minorPlayed, occupations: p.occupationPlayed, improvements: p.improvements, cardStates: p.cardStates, fences: p.fenceSegments })), majors: r.state.availableMajorImprovements, interaction: r.interaction, scores: r.scores, events: r.state.events, log: r.state.log }
    }), null, 2))
  })
}
export function optionsOf(r: SessionResponse): ActionChoiceOption[] {
  const i = r.interaction
  return i.stateId === 'wait' && 'options' in i.request ? i.request.options ?? [] : []
}
export function actorOf(r: SessionResponse) {
  if (r.interaction.stateId !== 'wait')
    throw new Error('Expected waiting native actor')
  return r.interaction.playerIndex
}
