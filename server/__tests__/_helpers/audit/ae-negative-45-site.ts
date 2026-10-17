// Helpers of ae-negative-45-site-session.test.ts from the negative audit snapshot fafd4f51b.
import fs from '../audit-evidence-fs'
import { expect, it as nativeIt } from 'vitest'
import type { ActionChoiceOption } from '../../../../shared/contract/types'
import { setWorkersAtHome } from '../../../../shared/domain/player'
import { GameSession, type SessionResponse } from '../../../game/authoritative-session'
import { createWorkSession } from '../session-fixtures'
import '../../../../shared/cards/A/A085_Homekeeper'

export const CARD_ID = 'D095_SiteManager'
export const OTHER_OCCUPATION = 'A085_Homekeeper'
export const FILLER = '__test_placeholder__'
export type BuildingResources = {
  wood?: number
  clay?: number
  reed?: number
  stone?: number
  food?: number
}
export const setup = (resources: BuildingResources = {}, majorIds = ['Major_Fireplace1']) => {
  const session = createWorkSession({ seed: 6095, options: { playerCount: 2 }, configure(state) {
      state.currentPlayerIndex = 0
      state.round = 5
      state.roundPhase = 'work'
      state.actionSpaces.forEach((space) => {
        space.takenBy = []
      })
      state.players.forEach((player) => {
        player.minorHand = [FILLER]
        player.occupationHand = [FILLER]
        player.minorPlayed = []
        player.occupationPlayed = []
        player.improvements = []
        player.cardStates = {}
        player.resources = {
          ...player.resources,
          wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
          sheep: 0, boar: 0, cattle: 0, begging: 0,
        }
        setWorkersAtHome(state, player, 2)
      })
      const owner = state.players[0]!
      owner.occupationHand = [CARD_ID, OTHER_OCCUPATION]
      owner.resources = { ...owner.resources, ...resources }
      state.availableMajorImprovements = [...majorIds]
    } })
  sessions.push(session)
  return session
}
export const playSiteManager = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (response.state.players[0]!.occupationHand.includes(CARD_ID)) {
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait')
      return response
    const option = optionsOf(response)?.find((candidate) => candidate.value === CARD_ID)
    expect(option, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(actorOf(response), option!.value)
  }
  if (response.interaction.stateId === 'wait'
    && requestOf(response).kind === 'select-trigger') {
    const trigger = optionsOf(response).find((candidate) => candidate.value === CARD_ID && !('disabled' in candidate && candidate.disabled))
    if (!trigger)
      return response
    expect(trigger, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(actorOf(response), trigger!.value)
  }
  expect(response.ok, response.error).toBe(true)
  return response
}
export const enterImmediateMajorChoice = (session: GameSession, start: SessionResponse, majorId: string) => {
  let response = start
  for (let depth = 0; depth < 4; depth += 1) {
    if (response.state.players[0]!.improvements.includes(majorId))
      return response
    if (response.interaction.stateId !== 'wait')
      return response
    if (response.interaction.promptKey === 'prompt.selectPayment')
      return response
    if (optionsOf(response)?.some((option) => option.value === majorId))
      return response
    const enter = optionsOf(response)?.find((option) => option.value !== '__skip__' && option.value !== 'cancel')
    expect(enter, JSON.stringify(response.interaction)).toBeDefined()
    if (!enter)
      return response
    response = session.resolveChoice(actorOf(response), enter.value)
    expect(response.ok, response.error).toBe(true)
  }
  return response
}
export const selectMajor = (session: GameSession, start: SessionResponse, majorId: string) => {
  const response = enterImmediateMajorChoice(session, start, majorId)
  if (response.state.players[0]!.improvements.includes(majorId))
    return response
  if (response.interaction.stateId === 'wait'
    && response.interaction.promptKey === 'prompt.selectPayment')
    return response
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait')
    return response
  const major = optionsOf(response)?.find((option) => option.value === majorId)
  expect(major, JSON.stringify(response.interaction)).toBeDefined()
  const selected = session.resolveChoice(actorOf(response), major!.value)
  expect(selected.ok, selected.error).toBe(true)
  return selected
}
export const choosePayment = (session: GameSession, start: SessionResponse, paid: Required<BuildingResources>) => {
  expect(start.interaction).toMatchObject({ stateId: 'wait', promptKey: 'prompt.selectPayment' })
  if (start.interaction.stateId !== 'wait')
    return start
  const payment = optionsOf(start)?.find((option) => {
    const resources = option.labelParams?.resourcesPaid
    if (typeof resources !== 'object' || resources === null)
      return false
    return 'wood' in resources && resources.wood === paid.wood
      && 'clay' in resources && resources.clay === paid.clay
      && 'reed' in resources && resources.reed === paid.reed
      && 'stone' in resources && resources.stone === paid.stone
      && 'food' in resources && resources.food === paid.food
  })
  expect(payment, JSON.stringify(start.interaction)).toBeDefined()
  const response = session.resolveChoice(actorOf(start), payment!.value)
  expect(response.ok, response.error).toBe(true)
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
export function requestOf(r: SessionResponse) {
  if (r.interaction.stateId !== 'wait')
    throw new Error('Expected waiting native interaction')
  return r.interaction.request
}
export function actorOf(r: SessionResponse) {
  if (r.interaction.stateId !== 'wait')
    throw new Error('Expected waiting native actor')
  return r.interaction.playerIndex
}
