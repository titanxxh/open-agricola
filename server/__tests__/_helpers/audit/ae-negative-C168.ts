// Helpers of ae-negative-C168-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import { createWorkSession } from '../session-fixtures'

export const CARD = 'C168_AnimalCatcher'
export const sessions: GameSession[] = []
export function setup(food = 8, combo = true) {
  const session = createWorkSession({ seed: 168, options: { playerCount: 4 }, configure: state => {
    state.round = 1
    const p = state.players[0]!
    p.occupationPlayed = [CARD]
    p.minorPlayed = combo ? ['E059_CombandCutter'] : []
    p.resources = { ...p.resources, food, sheep: 0, boar: 0, cattle: 0 }
    p.pastures = [{ row: 0, col: 2 }, { row: 0, col: 4 }, { row: 2, col: 4 }].map((tile, i) => ({
      id: `pasture-${i}`, tiles: [tile], size: 1, stables: 0, animalType: null, animalCount: 0,
    }))
    state.actionSpaces.find(space => space.id === 'sheep-market')!.resources.sheep = 3
  } })
  sessions.push(session)
  return session
}
export function choose(session: GameSession, replace: boolean) {
  const r = session.getState()
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
  const option = r.interaction.request.options?.find(o => replace ? o.sourceCard === CARD : o.labelKey === 'ui.interactionDoNotReplace')
  assert.ok(option)
  const result = session.resolveChoice(0, option.value)
  assert.equal(result.ok, true, result.error)
  return result
}
export function houseAnimals(session: GameSession) {
  const result = session.resolveChoice(0, 'confirm', { zones: [
    { id: 'pasture-0', zoneType: 'pasture', animalType: 'sheep', animalCount: 1 },
    { id: 'pasture-1', zoneType: 'pasture', animalType: 'boar', animalCount: 1 },
    { id: 'pasture-2', zoneType: 'pasture', animalType: 'cattle', animalCount: 1 },
  ] })
  assert.equal(result.ok, true, result.error)
  return result
}
export function totals(r: SessionResponse) {
  const p = r.state.players[0]!
  return { food: p.resources.food, sheep: p.resources.sheep, boar: p.resources.boar, cattle: p.resources.cattle }
}
