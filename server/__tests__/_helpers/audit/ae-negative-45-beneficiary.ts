// Helpers of ae-negative-45-beneficiary-session.test.ts from the negative audit snapshot fafd4f51b.
import fs from '../audit-evidence-fs'
import { expect, it as nativeIt } from 'vitest'
import '../../../../shared/cards/A/A116_WoodCutter'
import '../../../../shared/cards/B/B081_Handcart'
import '../../../../shared/cards/E/E092_FieldDoctor'
import '../../../../shared/cards/E/E093_Motivator'
import '../../../../shared/cards/E/E094_Prophet'
import '../../../../shared/cards/E/E095_Miller'
import '../../../../shared/cards/E/E097_Beneficiary'
import '../../../../shared/cards/E/E130_Overachiever'
import '../../../../shared/cards/E/E132_VeggieLover'
import '../../../../shared/cards/E/E135_Pickler'
import '../../../../shared/cards/E/E147_AnimalDriver'
import '../../../../shared/cards/E/E164_MountainPlowman'
import '../../../../shared/cards/E/E165_MasterHuntsman'
import '../../../../shared/cards/E/E166_Roastmaster'
import type { ActionChoiceOption, Resource } from '../../../../shared/contract/types'
import { setWorkersAtHome } from '../../../../shared/domain/player'
import { GameSession, type SessionResponse } from '../../../game/authoritative-session'
import { createWorkSession } from '../session-fixtures'

export type CardId = 'E092_FieldDoctor' | 'E093_Motivator' | 'E094_Prophet' | 'E095_Miller' | 'E097_Beneficiary' | 'E130_Overachiever' | 'E132_VeggieLover' | 'E135_Pickler' | 'E147_AnimalDriver' | 'E164_MountainPlowman' | 'E165_MasterHuntsman' | 'E166_Roastmaster'
export const FILLER = '__test_placeholder__'
export const OCCUPATIONS = ['A116_WoodCutter', 'B121_Geologist', 'C123_Freemason']
export const setupOccupation = (cardId: CardId, { playerCount = 2, played = false, round = 14, resources = {}, occupations = 0, workers = 2, }: {
  playerCount?: number
  played?: boolean
  round?: number
  resources?: Partial<Resource>
  occupations?: number
  workers?: number
} = {}) => {
  const session = createWorkSession({ seed: 4059, options: { playerCount: playerCount }, configure(state) {
      state.currentPlayerIndex = 0
      state.round = round
      state.roundPhase = 'work'
      state.players.forEach((player) => {
        player.minorHand = [FILLER]
        player.occupationHand = [FILLER]
        setWorkersAtHome(state, player, 2)
      })
      const player = state.players[0]!
      setWorkersAtHome(state, player, workers)
      player.occupationPlayed = OCCUPATIONS.slice(0, occupations)
      player.occupationHand = played ? [FILLER] : [cardId]
      if (played)
        player.occupationPlayed.push(cardId)
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0, ...resources,
      }
    } })
  sessions.push(session)
  return session
}
export const playOccupation = (session: GameSession, cardId: string) => {
  const response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId !== 'wait')
    return response
  const option = optionsOf(response)?.find((candidate) => candidate.value === cardId)
  return option ? session.resolveChoice(actorOf(response), option.value) : response
}
export const chooseSkip = (session: GameSession, response: SessionResponse, sourceCard?: string) => {
  const current = sourceCard ? resolveTriggerIfPresent(session, response, sourceCard) : response
  expect(current.interaction.stateId).toBe('wait')
  if (current.interaction.stateId !== 'wait')
    throw new Error('expected choice')
  return session.resolveChoice(actorOf(current), '__skip__')
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
export function resolveTriggerIfPresent(session: GameSession, r: SessionResponse, card: string) {
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'select-trigger') {
    const option = optionsOf(r).find(o => o.value === card && !o.disabled)
    if (option) {
      const next = session.resolveChoice(actorOf(r), option.value)
      expect(next.ok, next.error).toBe(true)
      return next
    }
  }
  return r
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
