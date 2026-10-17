import type { GameSession as SessionRuleOwner } from '../game/authoritative-session'
import { afterEach, describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getRegisteredCardListeners, executeCardListener } from '../../shared/cards/card-listeners'
import { createWorkSession } from './_helpers/session-fixtures'
import { playOccupation, playImprovement } from './_helpers/card-play-lifecycle'
import type { CardListenerContext } from '../../shared/cards/card-listeners'

import '../../shared/cards/E/E165_MasterHuntsman'
import { mkActionSpace } from '../../shared/cards/__tests__/fixtures'
import assert from 'node:assert/strict'
import * as audit57Livestock from './_helpers/audit/ae-negative-57-livestock'

const CARD_ID = 'E165_MasterHuntsman'

const findListener = (ruleOwner: SessionRuleOwner, id: string) =>
  ruleOwner.withCtx(() => getRegisteredCardListeners()).find((l) => l.id === id)

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))
const setup = () => {
  const session = createWorkSession({ seed: 9707, configure: (state) => {
    state.round = 14
    state.players[0]!.occupationPlayed = [CARD_ID]
    state.players[0]!.occupationHand = ['A125_Priest']
    state.players[0]!.minorHand = ['A030_BakingSheet']
    Object.assign(state.players[0]!.resources, { food: 6, clay: 2, boar: 0 })
    state.availableMajorImprovements = ['Major_Fireplace1']
  } })
  sessions.push(session)
  return session
}

describe('E165_MasterHuntsman session', () => {
  it('does not repeat its immediate boar when another occupation is played', () => {
    const session = setup()
    const response = playOccupation(session, 'A125_Priest')
    expect(response.state.players[0]!.resources.boar).toBe(0)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
  })

  it('does not repeat its immediate boar when a minor improvement is built', () => {
    const session = setup()
    const response = playImprovement(session, 'A030_BakingSheet')
    expect(response.state.players[0]!.resources.boar).toBe(0)
  })

  it('gains 1 boar after building a major improvement', () => {


    const session = new GameSession(42)
    const listener = findListener(session, 'E165-master-huntsman-after-major')
    expect(listener).toBeDefined()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]

    const result = session.withCtx(() => executeCardListener(listener!, {
      state,
      player,
      space: mkActionSpace({ id: 'improvement' }),
      actionId: 'improvement',
      phase: 'after',
      choice: 'major:Major_Well',
      result: { type: 'ok' },
    } as CardListenerContext))

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('leaf')
    if (result!.flow?.type === 'leaf') {
      expect(result!.flow.params).toEqual({ boar: 1 })
    }
  })

  it('does not trigger for minor improvement', () => {


    const session = new GameSession(42)
    const listener = findListener(session, 'E165-master-huntsman-after-major')
    expect(listener).toBeDefined()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]

    const result = session.withCtx(() => executeCardListener(listener!, {
      state,
      player,
      space: mkActionSpace({ id: 'improvement' }),
      actionId: 'improvement',
      phase: 'after',
      choice: 'minor:A055_JunkRoom',
      result: { type: 'ok' },
    } as CardListenerContext))

    expect(result).toBeUndefined()
  })

})

describe('ae-negative-57-livestock', () => {
  const { sessions, ok, save, make, finish, play, choose, count } = audit57Livestock
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('E165 N1 actual first Lessons grants exactly one boar and whole purchase undo restores hand and animals', () => {
    const session = make('E165_MasterHuntsman', undefined, false), response = finish(session, play(session, 'E165_MasterHuntsman')), undone = ok(session.undoAction())
    assert.deepEqual(count(response), [0, 1, 0]); assert.deepEqual(count(undone), [0, 0, 0]); assert.ok(undone.state.players[0]!.occupationHand.includes('E165_MasterHuntsman'))
    save('E165-N1', { response, undone })
  })
  it('E165 N2 actual major improvement pays its cost and grants one boar while paid minor and opponent major grant no owner boar', () => {
    for (const mode of ['major', 'minor', 'opponent']) {
      const actor = mode === 'opponent' ? 1 : 0
      const session = make('E165_MasterHuntsman', state => { state.currentPlayerIndex = actor; state.players[actor]!.resources.clay = 2; state.players[actor]!.minorHand = ['B004_WoodPile', 'A006_StorageBarn'] }, true, 14)
      let pending = ok(session.takeAction(actor, 'major-improvement'))
      if (pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'choice' && !pending.interaction.request.options.some(option => option.value === 'Major_Fireplace1')) pending = choose(session, pending, option => option.value.startsWith('action-improvement-') || option.labelKey === 'actions.improvement.name')
      const response = finish(session, choose(session, pending, option => option.value === (mode === 'minor' ? 'B004_WoodPile' : 'Major_Fireplace1')))
      assert.deepEqual(count(response), [0, mode === 'major' ? 1 : 0, 0]); assert.equal(response.state.players[actor]!.resources.clay, mode === 'minor' ? 2 : 0)
      save(`E165-N2-${mode}`, { pending, response })
    }
  })
})
