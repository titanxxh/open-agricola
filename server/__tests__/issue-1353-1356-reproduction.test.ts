import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import type { ActionChoiceOption, GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { jumpLeaf } from '../../shared/cards/helpers/jump-leaf'
import { getRoundPersonPlacementOrder, getRoundPlacementDetails } from '../../shared/cards/helpers/round-placement'
import { readTurnScopeToken } from '../../shared/cards/helpers/turn-token'
import { captureStateWithHistory } from '../../shared/session/history-streams'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'

const evidence = createScenarioEvidence(import.meta.url)
const FRESH = 'A097_Freshman'
const BANK = 'E027_PiggyBank'
const PART = 'D180_PartTimeWorker'
const CATCH = 'A107_Catcher'
const STUDIO = 'C039_StudioBoat'
const WOOD = 'D176_Woodshacker'

function opening(configure: (state: GameState) => void, playerCount = 2) {
  return evidence.track(createWorkSession({ seed: 42, options: { playerCount }, configure: state => {
    for (const player of state.players) {
      for (const key of Object.keys(player.resources)) Reflect.set(player.resources, key, 0)
    }
    configure(state)
  } }))
}

function ok(response: SessionResponse) {
  assert.equal(response.ok, true, `${response.error}: ${JSON.stringify(response.interaction)}`)
  return response
}

function options(response: SessionResponse): ActionChoiceOption[] {
  return response.interaction.stateId === 'wait' ? response.interaction.request.options ?? [] : []
}

function choose(session: GameSession, response: SessionResponse, predicate: (option: ActionChoiceOption) => boolean) {
  assert.equal(response.interaction.stateId, 'wait')
  const option = options(response).find(option => !option.disabled && predicate(option))
  assert.ok(option, JSON.stringify(response.interaction))
  return ok(session.resolveChoice(response.interaction.playerIndex, option.value))
}

function settle(session: GameSession, response = session.getState()) {
  for (let step = 0; step < 20 && response.interaction.stateId === 'wait'; step++) {
    const { request, playerIndex } = response.interaction
    if (request.kind === 'confirm-next-player') response = ok(session.resolveChoice(request.nextPlayerIndex, 'confirm'))
    else if (request.kind === 'confirm-player-switch') response = ok(session.resolveChoice(request.fromPlayerIndex, 'confirm'))
    else if (request.kind === 'animal-reorg') response = ok(session.resolveChoice(playerIndex, 'confirm', { zones: request.zones }))
    else if (request.kind === 'choice' && options(response).some(option => option.value === '__skip__')) {
      response = choose(session, response, option => option.value === '__skip__')
    } else break
  }
  return response
}

const snapshot = (session: GameSession, label: string, response = session.getState()) => {
  evidence.record(label, {
    state: response.state, interaction: response.interaction, scores: response.scores,
    engineCursor: session.getEngineStack().toCursor(),
  })
}

function purchaseStudioAndReachRoundTwo() {
  const session = opening(state => {
    state.players[0]!.occupationPlayed = ['A110_Roughcaster']
    state.players[0]!.minorHand = [STUDIO]
    state.players[0]!.resources.wood = 1
  })
  let response = ok(session.takeAction(0, 'meeting-place'))
  if (!options(response).some(option => option.value === STUDIO)) {
    response = choose(session, response, option => option.value.startsWith('action-improvement-'))
  }
  if (!response.state.players[0]!.minorPlayed.includes(STUDIO)) {
    response = choose(session, response, option => option.value === STUDIO)
  }
  assert.ok(response.state.actionSpaces.some(space => space.id === STUDIO))
  snapshot(session, 'studio-purchased', response)
  for (let step = 0; step < 8 && session.state.round < 2; step++) {
    response = settle(session)
    if (response.state.round === 2) break
    assert.equal(response.interaction.stateId, 'idle', JSON.stringify(response.interaction))
    const actor = response.state.currentPlayerIndex
    const availability = session.getActionAvailability(actor)
    const next = ['grain-seeds', 'reed-bank', 'day-laborer', 'clay-pit', 'forest', 'fishing'].find(id => availability[id])
    assert.ok(next)
    ok(session.takeAction(actor, next))
  }
  assert.equal(session.state.round, 2)
  assert.equal(session.state.currentPlayerIndex, 0)
  return session
}

describe('action-space use identity and Turn admission regressions (#1353–#1356)', () => {
  it.each([
    { branch: 0, wood: 2, stone: 0 },
    { branch: 1, wood: 1, stone: 1 },
    { branch: 2, wood: 0, stone: 2 },
  ])('#1353 third person taking $wood wood and $stone stone must not earn Catcher food', ({ branch, wood, stone }) => {
    const session = opening(state => {
      state.round = 8
      const owner = state.players[0]!
      owner.occupationPlayed = [PART, CATCH]
      owner.workers[2] = { id: '3', isActive: true, isNewborn: false }
      owner.rooms = 3
      owner.roomTiles.push({ row: 0, col: 0 })
      // Leave an opponent's third person available so observation stays in this work phase.
      const opponent = state.players[1]!
      opponent.workers[2] = { id: '3', isActive: true, isNewborn: false }
      opponent.rooms = 3
      opponent.roomTiles.push({ row: 0, col: 0 })
      state.actionSpaces.find(space => space.id === 'forest')!.resources = { wood: 2, stone: 2 }
    }, 5)
    const safe = ['grain-seeds', 'day-laborer', 'reed-bank', 'clay-pit', 'copse-56', 'fishing', 'meeting-place', 'traveling-players-56', 'riverbank-forest-56', 'grove-56', 'hollow-56']
    for (let step = 0; step < 12; step++) {
      const ready = settle(session)
      assert.equal(ready.interaction.stateId, 'idle', JSON.stringify(ready.interaction))
      const actor = ready.state.currentPlayerIndex
      if (actor === 0 && getRoundPersonPlacementOrder(ready.state.players[0]!).length === 2) break
      const availability = session.getActionAvailability(actor)
      const space = safe.find(id => availability[id])
      assert.ok(space)
      settle(session, ok(session.takeAction(actor, space)))
    }
    const foodBefore = session.state.players[0]!.resources.food
    snapshot(session, 'before-third-person')
    let response = ok(session.takeAction(0, 'forest'))
    const returns = options(response).filter(option => option.value !== '__skip__')
    assert.equal(returns.length, 3, JSON.stringify(response.interaction))
    const mixed = returns[branch]!
    response = choose(session, response, option => option.value === mixed.value)
    response = settle(session, response)
    snapshot(session, 'after-mixed-take', response)
    assert.equal(getRoundPersonPlacementOrder(response.state.players[0]!).length, 3)
    assert.deepEqual([response.state.players[0]!.resources.wood, response.state.players[0]!.resources.stone, response.state.players[0]!.resources.boar], [wood, stone, 1])
    assert.deepEqual(response.state.actionSpaces.find(space => space.id === 'forest')!.resources, { wood: 2 - wood, stone: 2 - stone })
    assert.equal(response.state.players[0]!.resources.food - foodBefore, 0, 'Catcher must read the four goods at placement, not three after the first partial take')
    assert.deepEqual(response.state.events.filter(event => event.type === 'resource.moved' && event.reason === 'collect'
      && event.from.kind === 'actionSpace' && event.from.spaceId === 'forest').map(event => event.resources), [{ wood: 2, stone: 2 }])
  })

  it('#1354 two Piggy Bank oven bakes before placement allow Freshman only once', () => {
    const occupations = ['A110_Roughcaster', 'A116_WoodCutter']
    let session = opening(state => {
      state.round = 13
      const owner = state.players[0]!
      owner.occupationPlayed = [FRESH]
      owner.occupationHand = [...occupations]
      owner.minorPlayed = [BANK]
      owner.cardStates[BANK] = { counters: { food: 12 } }
    })
    // Establish a real ended Turn and return to P0's next rotation opportunity.
    settle(session, ok(session.takeAction(0, 'grain-seeds')))
    settle(session, ok(session.takeAction(1, 'forest')))
    assert.equal(session.state.currentPlayerIndex, 0)
    assert.equal(readTurnScopeToken(session.state.players[0]!), undefined)
    snapshot(session, 'before-ovens')
    for (const [index, oven] of ['Major_ClayOven', 'Major_StoneOven'].entries()) {
      const beforeQueries = captureStateWithHistory(session.state)
      for (let query = 0; query < 3; query++) {
        session.getState()
        session.getActionAvailability(0)
      }
      assert.deepEqual(captureStateWithHistory(session.state), beforeQueries, 'Queries must not consume Freshman or mutate rule state')
      let response = ok(session.takeAnytimeAction(0, 'E27-piggy-bank-anytime'))
      response = choose(session, response, option => option.value === oven)
      session = evidence.track(new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session))))))
      response = session.getState()
      snapshot(session, `oven-${index + 1}-bake-offer`, response)
      assert.equal(readTurnScopeToken(response.state.players[0]!), undefined)
      assert.equal(getRoundPersonPlacementOrder(response.state.players[0]!).length, 1)
      for (let step = 0; step < 4 && response.interaction.stateId === 'wait'; step++) {
        const replacement = options(response).find(option => option.sourceCard === FRESH)
        if (replacement) response = choose(session, response, option => option.value === replacement.value)
        else if (options(response).some(option => option.value === occupations[index])) {
          response = choose(session, response, option => option.value === occupations[index])
        } else break
      }
      snapshot(session, `oven-${index + 1}-settled`, response)
      if (index === 0) {
        let undone = response
        for (let step = 0; step < 6 && undone.state.players[0]!.cardStates[BANK]?.counters?.food !== 12; step++) undone = ok(session.undoStep(0))
        assert.equal(undone.state.players[0]!.cardStates[BANK]?.counters?.food, 12)
        assert.equal(undone.state.players[0]!.occupationPlayed.filter(card => occupations.includes(card)).length, 0)
        response = ok(session.takeAnytimeAction(0, 'E27-piggy-bank-anytime'))
        response = choose(session, response, option => option.value === oven)
        response = choose(session, response, option => option.sourceCard === FRESH)
        if (options(response).some(option => option.value === occupations[0])) response = choose(session, response, option => option.value === occupations[0])
        assert.equal(response.state.players[0]!.cardStates[BANK]?.counters?.food, 6)
      }
    }
    const response = session.getState()
    assert.deepEqual(response.state.players[0]!.improvements, ['Major_ClayOven', 'Major_StoneOven'])
    assert.equal(response.state.players[0]!.cardStates[BANK]?.counters?.food, 0)
    assert.equal(response.state.players[0]!.occupationPlayed.filter(card => occupations.includes(card)).length, 1,
      'The second real Bake Bread in the same pre-placement gap must not play another free occupation')
  })

  it('#1355 real Studio Boat purchase gives its point before its food is collected', () => {
    const session = purchaseStudioAndReachRoundTwo()
    const eventStart = session.state.events.length
    const foodBefore = session.state.players[0]!.resources.food
    const response = ok(session.takeAction(0, STUDIO))
    const events = response.state.events.slice(eventStart)
    evidence.record('studio-use-events', events)
    snapshot(session, 'studio-owner-used', response)
    const collected = events.findIndex(event => event.type === 'resource.moved' && event.reason === 'collect' && event.from.kind === 'actionSpace' && event.from.spaceId === STUDIO)
    const scored = events.findIndex(event => event.type === 'card.stateChanged' && event.cardId === STUDIO && event.key === 'bonusVp')
    assert.equal(response.state.players[0]!.resources.food - foodBefore, 1)
    assert.equal(response.state.players[0]!.cardStates[STUDIO]?.counters?.bonusVp, 1)
    assert.ok(response.scores?.length === 2)
    assert.ok(collected >= 0 && scored >= 0, JSON.stringify(events))
    assert.ok(scored < collected, `bonusVp event index ${scored}, collect index ${collected}`)
  })

  it('#1355 control: an opponent takes Studio Boat food without giving its owner a point', () => {
    const session = purchaseStudioAndReachRoundTwo()
    settle(session, ok(session.takeAction(0, 'grain-seeds')))
    const foodBefore = session.state.players[1]!.resources.food
    const response = ok(session.takeAction(1, STUDIO))
    snapshot(session, 'studio-opponent-used', response)
    assert.equal(response.state.players[1]!.resources.food - foodBefore, 1)
    assert.equal(response.state.players[0]!.cardStates[STUDIO]?.counters?.bonusVp ?? 0, 0)
    assert.equal(response.state.events.some(event => event.type === 'card.stateChanged' && event.cardId === STUDIO && event.key === 'bonusVp'), false)
  })

  it('#1356 control: a normal first Forest placement awards one clay', () => {
    const session = opening(state => {
      state.round = 8
      state.players[0]!.occupationPlayed = [WOOD]
      state.actionSpaces.find(space => space.id === 'forest')!.resources = { wood: 3 }
    }, 5)
    const response = ok(session.takeAction(0, 'forest'))
    snapshot(session, 'normal-placement-control', response)
    assert.deepEqual([response.state.players[0]!.resources.wood, response.state.players[0]!.resources.clay], [3, 1])
    assert.equal(getRoundPlacementDetails(response.state.players[0]!).length, 1)
  })

  it('#1356 first workerless Forest use must award one clay', () => {
    const session = opening(state => {
      state.round = 8
      state.players[0]!.occupationPlayed = [WOOD]
      state.players[0]!.minorPlayed = ['TEST_WorkerlessUse']
      state.actionSpaces.find(space => space.id === 'forest')!.resources = { wood: 3 }
    }, 5)
    session.withCtx(() => requireActiveCardRegistry('issue-1356-reproduction').registerListener({
      id: 'test-workerless-use', cardIds: ['TEST_WorkerlessUse'], actions: ['anytime'], phases: ['anytime'],
      handler: () => ({ sourceCard: 'TEST_WorkerlessUse', flow: jumpLeaf({ sourceCard: 'TEST_WorkerlessUse', targetSpaceId: 'forest' }) }),
    }))
    snapshot(session, 'before-workerless-use')
    const response = ok(session.takeAnytimeAction(0, 'test-workerless-use'))
    snapshot(session, 'after-workerless-use', response)
    assert.equal(response.state.players[0]!.resources.wood, 3)
    assert.deepEqual(getRoundPlacementDetails(response.state.players[0]!), [])
    assert.deepEqual(response.state.actionSpaces.find(space => space.id === 'forest')!.takenBy, [])
    assert.equal(response.scores?.length, 5)
    assert.equal(response.interaction.stateId, 'idle')
    assert.equal(response.state.players[0]!.resources.clay, 1, 'A real use need not place a new worker')
  })
})
