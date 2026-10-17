import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { collectScheduledEffectPreviews } from '../../shared/actions/scheduled-effect-preview'
import type { GameSession } from '../game/authoritative-session'
import '../../shared/cards/E/E140_Carter'
import assert from 'node:assert/strict'
import * as audit53Cards from './_helpers/audit/ae-negative-53-cards'

const CARD_ID = 'E140_Carter'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const setup = () => {
  const session = createWorkSession({ seed: 6140, configure: state => {
    state.players[0]!.occupationHand = [CARD_ID]
    state.players.forEach(player => { player.resources.food = 30; player.resources.wood = 0; player.resources.clay = 0 })
  } })
  sessions.push(session)
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId === 'wait' && response.state.players[0]!.occupationHand.includes(CARD_ID)) {
    response = session.resolveChoice(response.interaction.playerIndex, CARD_ID)
  }
  expect(response.ok, response.error).toBe(true)
  expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  return session
}
const prepareCollect = (session: GameSession, round = 2, actor = 0) => {
  const state = session.getState().state
  state.round = round
  state.currentPlayerIndex = actor
  state.players[0]!.resources.food = 0
  state.actionSpaces.forEach(space => { space.takenBy = [] })
  const forest = state.actionSpaces.find(space => space.id === 'forest')!
  forest.resources.wood = 2
  forest.resources.clay = 1
  session.loadState(state)
}

describe('E140 actual next-round collection window', () => {
  it('playing the occupation activates the next-round formula without paying resources during repeated description reads', () => {
    const session = setup()
    expect(session.state.players[0]!.cardStates[CARD_ID]?.extraData?.triggerRound).toBe(2)
    const before = JSON.stringify(session.state)
    const view = session.withCtx(() => collectScheduledEffectPreviews(session.state, session.state.players[0]!, session.actionHooks)).find(entry => entry.sourceCard === CARD_ID)
    expect(view).toMatchObject({ round: 2, timing: 'afterCollect', description: { effectPreview: { kind: 'ruleOperation', operation: { kind: 'gain-per-building-resource-collected', resource: 'food', perBuildingResource: 1 } } } })
    expect(JSON.stringify(session.state)).toBe(before)
  })
  it('counts all actually collected building resources once and logs the exact reward', () => {
    const session = setup()
    prepareCollect(session)
    const response = resolveTriggerIfPresent(session, session.takeAction(0, 'forest'), CARD_ID)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, clay: 1, food: 3 })
    expect(response.state.events.some(event => event.type === 'resource.moved' && event.sourceCardId === CARD_ID && event.resources.food === 3)).toBe(true)
    expect(session.withCtx(() => collectScheduledEffectPreviews(session.state, session.state.players[0]!, session.actionHooks)).filter(entry => entry.sourceCard === CARD_ID)).toHaveLength(1)
  })
  it.each([1, 3])('does not pay outside its activated round (%i)', round => {
    const session = setup()
    prepareCollect(session, round)
    const response = session.takeAction(0, 'forest')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })
  it('does not reward food actions or the opponent collecting building resources', () => {
    const session = setup()
    prepareCollect(session)
    const food = session.takeAction(0, 'day-laborer')
    expect(food.ok, food.error).toBe(true)
    expect(food.state.players[0]!.resources.food).toBe(2)
    prepareCollect(session, 2, 1)
    const opponent = session.takeAction(1, 'forest')
    expect(opponent.ok, opponent.error).toBe(true)
    expect(opponent.state.players[0]!.resources.food).toBe(0)
  })
})

describe('ae-negative-53-cards', () => {
  const { sessions, save, ok, make, finish, ready, lesson, reach, resources, ownerTurn } = audit53Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('E140 N1 actual Lessons marks next round and genuine progression yields one food per actual Forest resource then', () => { const s = make('E140_Carter', undefined, false, 5), played = finish(s, lesson(s, 'E140_Carter'), false); assert.equal(played.state.players[0]!.cardStates.E140_Carter?.extraData?.triggerRound, 6); const next = finish(s, reach(s, 6), false); resources(next, { food: 100 }); const p = ok(s.takeAction(0, 'forest')), r = finish(s, p, false); resources(r, { wood: 3, food: 103 }); save('E140-N1', { played, next, p, r }) })
  it('E140 N2 actual current and later round collections or next-round opponent collection cannot grant owner Carter food', () => { const s = make('E140_Carter', undefined, false, 5), played = finish(s, lesson(s, 'E140_Carter'), false); ownerTurn(s); const current = finish(s, ok(s.takeAction(0, 'forest')), false); resources(current, { food: 100 }); const late = finish(s, reach(s, 7), false), beforeFood = late.state.players[0]!.resources.food, r = finish(s, ok(s.takeAction(0, 'forest')), false); resources(r, { food: beforeFood }); const c = make('E140_Carter', undefined, false, 5); finish(c, lesson(c, 'E140_Carter'), false); finish(c, reach(c, 6), false); finish(c, ok(c.takeAction(0, 'grain-seeds')), false); ready(c); const cr = finish(c, ok(c.takeAction(1, 'forest')), false); resources(cr, { food: 100 }); resources(cr, { food: 100 }, 1); save('E140-N2', { played, current, late, r, cr }) })
})
