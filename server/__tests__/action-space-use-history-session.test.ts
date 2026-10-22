import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import type { ActionChoiceOption, ActionFlow, GameState } from '../../shared/contract/types'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'
import { jumpLeaf } from '../../shared/cards/helpers/jump-leaf'
import { getRoundPersonPlacementOrder } from '../../shared/cards/helpers/round-placement'
import { captureStateWithHistory } from '../../shared/session/history-streams'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import { createWorkSession } from './_helpers/session-fixtures'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const evidence = createScenarioEvidence(import.meta.url)
const WOOD = 'D176_Woodshacker', CATCH = 'A107_Catcher', PROBE = 'TEST_UseHistory'
const STUDIO = 'C039_StudioBoat'
function opening(configure: (state: GameState) => void, playerCount = 5) {
  return evidence.track(createWorkSession({ seed: 42, options: { playerCount }, configure: state => {
    state.round = 8
    for (const player of state.players) for (const key of Object.keys(player.resources)) Reflect.set(player.resources, key, 0)
    configure(state)
  } }))
}
function ok(response: SessionResponse) {
  assert.equal(response.ok, true, `${response.error}: ${JSON.stringify(response.interaction)}`)
  return response
}
const options = (response: SessionResponse): ActionChoiceOption[] => response.interaction.stateId === 'wait' ? response.interaction.request.options ?? [] : []
function choose(session: GameSession, response: SessionResponse, predicate: (option: ActionChoiceOption) => boolean) {
  assert.equal(response.interaction.stateId, 'wait')
  const option = options(response).find(option => !option.disabled && predicate(option))
  assert.ok(option, JSON.stringify(response.interaction))
  return ok(session.resolveChoice(response.interaction.playerIndex, option.value))
}
function handoffs(session: GameSession, response = session.getState()) {
  for (let step = 0; step < 20 && response.interaction.stateId === 'wait'; step++) {
    const { request } = response.interaction
    if (request.kind === 'confirm-next-player') response = ok(session.resolveChoice(request.nextPlayerIndex, 'confirm'))
    else if (request.kind === 'confirm-player-switch') response = ok(session.resolveChoice(request.fromPlayerIndex, 'confirm'))
    else break
  }
  return response
}
const safeSpaces = ['grain-seeds', 'day-laborer', 'reed-bank', 'clay-pit', 'fishing', 'traveling-players-56', 'hollow-56', 'grove-56', 'riverbank-forest-56', 'meeting-place']
function advanceToOwner(session: GameSession) {
  for (let step = 0; step < 12; step++) {
    const response = handoffs(session)
    assert.equal(response.interaction.stateId, 'idle', JSON.stringify(response.interaction))
    const actor = response.state.currentPlayerIndex
    if (actor === 0) return
    const available = session.getActionAvailability(actor)
    const space = safeSpaces.find(id => available[id])
    assert.ok(space)
    ok(session.takeAction(actor, space))
  }
  assert.fail('owner did not receive the next placement')
}
function restore(session: GameSession) {
  return evidence.track(new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session))))))
}
function installAnytime(session: GameSession, flow: ActionFlow) {
  session.withCtx(() => requireActiveCardRegistry('use-history-test').registerListener({
    id: 'test-use-history', cardIds: [PROBE], actions: ['anytime'], phases: ['anytime'],
    handler: () => ({ flow, sourceCard: PROBE }),
  }))
}
const refillAndUse: ActionFlow = { type: 'seq', children: [
  { type: 'leaf', actionId: 'special-effect', sourceCard: PROBE, params: { kind: 'add-resource-to-space', spaceId: 'forest', resource: 'wood', amount: 1 } },
  jumpLeaf({ sourceCard: PROBE, targetSpaceId: 'forest' }),
] }
const uses = (response: SessionResponse, playerIndex = 0) => response.state.events.filter(event =>
  event.type === 'actionSpace.useStarted' && event.actorPlayerId === response.state.players[playerIndex]!.id && event.round === response.state.round)

describe('accepted action-space use facts', () => {
  it('counts two automatically selected extra placements within one command separately', () => {
    const session = opening(state => {
      state.players[0]!.occupationPlayed = [WOOD]
      state.players[0]!.minorPlayed = [PROBE]
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
      state.actionSpaces.find(space => space.id === 'copse-56')!.resources.wood = 2
    })
    installAnytime(session, { type: 'seq', children: ['forest', 'copse-56'].map(target => ({
      type: 'leaf', actionId: 'place-farmer', sourceCard: PROBE, actionContext: { constraints: [target] },
    })) })
    const response = ok(session.takeAnytimeAction(0, 'test-use-history'))
    assert.equal(response.state.players[0]!.resources.wood, 5)
    assert.equal(response.state.players[0]!.resources.clay, 3)
    assert.deepEqual(getRoundPersonPlacementOrder(response.state.players[0]!), ['forest', 'copse-56'])
    const entries = uses(response)
    assert.equal(entries.length, 2)
    assert.equal(new Set(entries.map(event => event.type === 'actionSpace.useStarted' ? event.useId : undefined)).size, 2)
  })

  it.each([
    { card: 'D116_TreeInspector', firstWood: 2, firstClay: 1, totalClay: 3 },
    { card: 'C162_ForestOwner', firstWood: 4, firstClay: 0, totalClay: 1 },
  ])('classifies $card by its accumulation at entry', ({ card, firstWood, firstClay, totalClay }) => {
    const session = opening(state => {
      state.players[0]!.occupationPlayed = [WOOD, card]
      state.actionSpaces.push(...createPlayerActionSpaces(state))
      if (card === 'D116_TreeInspector') state.actionSpaces.find(space => space.id === card)!.resources.wood = 2
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
    })
    let response = ok(session.takeAction(0, card))
    assert.deepEqual([response.state.players[0]!.resources.wood, response.state.players[0]!.resources.clay], [firstWood, firstClay])
    advanceToOwner(session)
    response = ok(session.takeAction(0, 'forest'))
    assert.deepEqual([response.state.players[0]!.resources.wood, response.state.players[0]!.resources.clay], [firstWood + 3, totalClay])
    assert.equal(uses(response).length, 2)
    assert.equal(response.scores.length, 5)
  })

  it('counts repeated workerless uses 1/2/0 without inventing person placements, including JSON restore', () => {
    let session = opening(state => {
      state.players[0]!.occupationPlayed = [WOOD, CATCH]
      state.players[0]!.minorPlayed = [PROBE]
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 4
    })
    installAnytime(session, refillAndUse)
    for (const [index, clay] of [1, 3, 3].entries()) {
      if (index === 1) { session = restore(session); installAnytime(session, refillAndUse) }
      const before = captureStateWithHistory(session.state)
      for (let query = 0; query < 3; query++) { session.getState(); session.getActionAvailability(0) }
      assert.deepEqual(captureStateWithHistory(session.state), before)
      const response = ok(session.takeAnytimeAction(0, 'test-use-history'))
      assert.equal(response.state.players[0]!.resources.clay, clay)
      assert.equal(response.state.players[0]!.resources.food, 0, 'workerless use must not trigger Catcher')
      assert.equal(response.state.players[0]!.resources.wood, 5 + index)
      assert.equal(uses(response).length, index + 1)
      assert.deepEqual(getRoundPersonPlacementOrder(response.state.players[0]!), [])
      assert.deepEqual(response.state.actionSpaces.find(space => space.id === 'forest')!.takenBy, [])
      assert.equal(response.interaction.stateId, 'idle')
    }
  })

  it('retains a wood use made before Woodshacker is played through the occupation action', () => {
    const session = opening(state => {
      state.players[0]!.minorPlayed = [PROBE]
      state.players[0]!.occupationHand = [WOOD]
      state.players[0]!.resources.food = 4
      for (const player of state.players.slice(0, 2)) {
        player.workers.push({ id: '3', isActive: true, isNewborn: false })
        player.rooms = 3
        player.roomTiles.push({ row: 0, col: 0 })
      }
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
    })
    installAnytime(session, refillAndUse)
    assert.equal(ok(session.takeAction(0, 'forest')).state.players[0]!.resources.clay, 0)
    advanceToOwner(session)
    let response = ok(session.takeAction(0, 'lessons-56-2f'))
    if (!response.state.players[0]!.occupationPlayed.includes(WOOD)) response = choose(session, response, option => option.value === WOOD)
    assert.ok(response.state.players[0]!.occupationPlayed.includes(WOOD))
    advanceToOwner(session)
    response = ok(session.takeAnytimeAction(0, 'test-use-history'))
    assert.equal(response.state.players[0]!.resources.clay, 2)
    assert.equal(response.state.players[0]!.resources.wood, 4)
  })

  it('preserves an accepted blocked use and its reward exactly once until undo', () => {
    const session = opening(state => {
      state.players[0]!.occupationPlayed = [WOOD]
      state.players[0]!.minorPlayed = [PROBE]
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 0
    })
    installAnytime(session, jumpLeaf({ sourceCard: PROBE, targetSpaceId: 'forest' }))
    let response = ok(session.takeAnytimeAction(0, 'test-use-history'))
    assert.equal(response.interaction.stateId === 'wait' && response.interaction.request.kind, 'engine-blocked')
    assert.equal(response.state.players[0]!.resources.clay, 1)
    assert.equal(uses(response).length, 1)
    for (let query = 0; query < 3; query++) response = session.getState()
    assert.equal(uses(response).length, 1)
    response = ok(session.undoStep(0))
    assert.equal(uses(response).length, 0)
    assert.equal(response.state.players[0]!.resources.clay, 0)
    response = ok(session.takeAnytimeAction(0, 'test-use-history'))
    assert.equal(response.state.players[0]!.resources.clay, 1)
    assert.equal(uses(response).length, 1)
  })

  it('does not turn placement-only plus a local collect into a complete space use', () => {
    const session = opening(state => {
      state.players[0]!.occupationPlayed = [WOOD, CATCH]
      state.players[0]!.minorPlayed = [PROBE]
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 5
    })
    installAnytime(session, { type: 'seq', children: [
      { type: 'leaf', actionId: 'place-farmer-on-space', sourceCard: PROBE, params: { spaceId: 'forest', executeTarget: false } },
      { type: 'leaf', actionId: 'collect', sourceCard: PROBE, actionContext: { spaceId: 'forest', resource: 'wood', amount: 5 } },
    ] })
    const response = ok(session.takeAnytimeAction(0, 'test-use-history'))
    assert.deepEqual([response.state.players[0]!.resources.wood, response.state.players[0]!.resources.clay, response.state.players[0]!.resources.food], [5, 0, 0])
    assert.equal(getRoundPersonPlacementOrder(response.state.players[0]!).length, 1)
    assert.equal(uses(response).length, 0)
  })
})

describe('before reactions retain the triggering use identity', () => {
  it.each([1, 2, 3])('Catcher rewards person %s for exactly 5/4/3 building resources', ordinal => {
    const session = opening(state => {
      state.players[0]!.occupationPlayed = [CATCH]
      for (const player of state.players) {
        player.workers.push({ id: '3', isActive: true, isNewborn: false })
        player.rooms = 3
        player.roomTiles.push({ row: 0, col: 0 })
      }
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 6 - ordinal
    }, 2)
    for (let previous = 0; previous < ordinal - 1; previous++) {
      ok(session.takeAction(0, previous === 0 ? 'grain-seeds' : 'reed-bank'))
      advanceToOwner(session)
    }
    const food = session.state.players[0]!.resources.food
    const response = ok(session.takeAction(0, 'forest'))
    assert.equal(response.state.players[0]!.resources.food - food, 1)
    assert.equal(response.state.players[0]!.resources.wood, 6 - ordinal)
    assert.equal(getRoundPersonPlacementOrder(response.state.players[0]!).length, ordinal)
  })

  function installNested(session: GameSession, actionId: string, target: string) {
    session.withCtx(() => requireActiveCardRegistry('nested-use-test').registerListener({
      id: 'test-nested-before', cardIds: [PROBE], actionSpaces: [actionId], phases: ['before'],
      handler: () => ({ sourceCard: PROBE, flow: { type: 'leaf', actionId: 'place-farmer-on-space', sourceCard: PROBE, params: { spaceId: target } } }),
    }))
  }
  it('freezes Catcher person ordinal across nested placement, restore and undo', () => {
    let session = opening(state => {
      state.players[0]!.occupationPlayed = [CATCH]
      state.players[0]!.minorPlayed = [PROBE]
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 5
    }, 2)
    installNested(session, 'forest', 'day-laborer')
    let response = ok(session.takeAction(0, 'forest'))
    assert.equal(options(response).filter(option => option.sourceCard === CATCH || option.sourceCard === PROBE).length, 2)
    session = restore(session); installNested(session, 'forest', 'day-laborer')
    assertRejectedUnchanged(session, () => session.resolveChoice(0, 'invalid'))
    response = choose(session, session.getState(), option => option.sourceCard === PROBE)
    if (options(response).some(option => option.sourceCard === CATCH)) response = choose(session, response, option => option.sourceCard === CATCH)
    assert.equal(response.state.players[0]!.resources.food, 3, 'day laborer gives two food and the original first person earns one Catcher food')
    assert.equal(response.state.players[0]!.resources.wood, 5)
    assert.deepEqual(getRoundPersonPlacementOrder(response.state.players[0]!), ['forest', 'day-laborer'])
    assert.equal(uses(response).length, 2)
    response = ok(session.undoAction(0))
    assert.equal(uses(response).length, 0)
    assert.equal(response.state.players[0]!.resources.food, 0)
    response = ok(session.takeAction(0, 'forest'))
    response = choose(session, response, option => option.sourceCard === CATCH)
    if (options(response).some(option => option.sourceCard === PROBE)) response = choose(session, response, option => option.sourceCard === PROBE)
    assert.equal(response.state.players[0]!.resources.food, 3)
  })

  it('freezes Woodshacker use order across a nested second wood use', () => {
    let session = opening(state => {
      state.players[0]!.occupationPlayed = [WOOD]
      state.players[0]!.minorPlayed = [PROBE]
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
      state.actionSpaces.find(space => space.id === 'copse-56')!.resources.wood = 2
    })
    installNested(session, 'forest', 'copse-56')
    let response = ok(session.takeAction(0, 'forest'))
    session = restore(session)
    installNested(session, 'forest', 'copse-56')
    response = session.getState()
    response = choose(session, response, option => option.sourceCard === PROBE)
    if (options(response).some(option => option.sourceCard === WOOD)) response = choose(session, response, option => option.sourceCard === WOOD)
    assert.equal(response.state.players[0]!.resources.clay, 3)
    assert.equal(response.state.players[0]!.resources.wood, 5)
    assert.equal(uses(response).length, 2)
    assert.deepEqual(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === WOOD).map(event => event.type === 'resource.moved' ? event.resources.clay : undefined), [2, 1])
  })

  it.each([true, false])('Catcher reads live goods after the chosen before order, Catcher first=%s', catcherFirst => {
    const session = opening(state => {
      state.players[0]!.occupationPlayed = [CATCH]
      state.players[0]!.minorPlayed = [PROBE]
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 5
    }, 2)
    session.withCtx(() => requireActiveCardRegistry('catcher-live-goods-test').registerListener({
      id: 'test-take-one-before', cardIds: [PROBE], actionSpaces: ['forest'], phases: ['before'],
      handler: () => ({ sourceCard: PROBE, flow: { type: 'leaf', actionId: 'collect', sourceCard: PROBE,
        actionContext: { spaceId: 'forest', resource: 'wood', amount: 1 } } }),
    }))
    let response = ok(session.takeAction(0, 'forest'))
    response = choose(session, response, option => option.sourceCard === (catcherFirst ? CATCH : PROBE))
    if (options(response).some(option => option.sourceCard === (catcherFirst ? PROBE : CATCH))) response = choose(session, response, option => option.sourceCard === (catcherFirst ? PROBE : CATCH))
    assert.equal(response.state.players[0]!.resources.food, catcherFirst ? 1 : 0)
    assert.equal(response.state.players[0]!.resources.wood, 5)
    assert.equal(uses(response).length, 1)
  })

  it.each([true, false])('Studio Boat shares before ordering, point first=%s', pointFirst => {
    let session = opening(state => {
      state.players[0]!.minorPlayed = [STUDIO, PROBE]
      state.actionSpaces.push(...createPlayerActionSpaces(state))
      state.actionSpaces.find(space => space.id === STUDIO)!.resources.food = 2
    }, 2)
    const install = () => session.withCtx(() => requireActiveCardRegistry('studio-before-test').registerListener({
      id: 'test-studio-before', cardIds: [PROBE], actionSpaces: [STUDIO], phases: ['before'],
      handler: () => ({ sourceCard: PROBE, flow: { type: 'leaf', actionId: 'gain', sourceCard: PROBE, params: { food: 1 } } }),
    }))
    install()
    let response = ok(session.takeAction(0, STUDIO))
    assert.equal(options(response).filter(option => option.sourceCard === STUDIO || option.sourceCard === PROBE).length, 2)
    session = restore(session); install()
    response = choose(session, session.getState(), option => option.sourceCard === (pointFirst ? STUDIO : PROBE))
    if (options(response).some(option => option.sourceCard === (pointFirst ? PROBE : STUDIO))) response = choose(session, response, option => option.sourceCard === (pointFirst ? PROBE : STUDIO))
    assert.equal(response.state.players[0]!.resources.food, 3)
    assert.equal(response.state.players[0]!.cardStates[STUDIO]?.counters?.bonusVp, 1)
    const events = response.state.events
    const point = events.findIndex(event => event.type === 'card.stateChanged' && event.cardId === STUDIO && event.key === 'bonusVp')
    const extra = events.findIndex(event => event.type === 'resource.moved' && event.sourceCardId === PROBE)
    const collect = events.findIndex(event => event.type === 'resource.moved' && event.reason === 'collect' && event.from.kind === 'actionSpace' && event.from.spaceId === STUDIO)
    assert.equal(point < extra, pointFirst)
    assert.ok(point < collect && extra < collect)
    response = ok(session.undoAction(0))
    assert.equal(response.state.players[0]!.cardStates[STUDIO]?.counters?.bonusVp ?? 0, 0)
    assert.equal(uses(response).length, 0)
  })
})

describe('work qualification through the existing return-home hooks', () => {
  it.each([
    { card: 'E010_StrawHat', sourceSpace: 'farmland', priorUses: 0 },
    { card: 'E010_StrawHat', sourceSpace: 'farmland', priorUses: 1 },
    { card: 'D051_Archway', sourceSpace: 'D051_Archway', priorUses: 0 },
    { card: 'D051_Archway', sourceSpace: 'D051_Archway', priorUses: 1 },
  ])('$card counts its end-work movement after $priorUses earlier wood uses', ({ card, sourceSpace, priorUses }) => {
    const session = opening(state => {
      state.round = 3
      state.players[0]!.occupationPlayed = [WOOD, CATCH]
      state.players[0]!.minorPlayed = [card]
      state.actionSpaces.push(...createPlayerActionSpaces(state))
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 4
    })
    let response = session.getState()
    for (let step = 0; step < 15; step++) {
      response = handoffs(session, response)
      if (response.state.roundPhase !== 'work') break
      const actor = response.state.currentPlayerIndex
      const placed = getRoundPersonPlacementOrder(response.state.players[0]!).length
      const available = session.getActionAvailability(actor)
      const target = actor === 0 && placed === 0 ? priorUses ? 'copse-56' : sourceSpace
        : actor === 0 && placed === 1 && priorUses ? sourceSpace : safeSpaces.find(id => available[id])
      assert.ok(target)
      response = ok(session.takeAction(actor, target))
      if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'farm-select') {
        const request = response.interaction.request
        assert.equal(request.farm.farmType, 'plow')
        response = ok(session.commitSelectionChoice(actor, { tile: request.farm.selectableTiles[0] }))
      }
      if (response.state.roundPhase === 'work' && options(response).some(option => option.value === '__skip__')) {
        response = choose(session, response, option => option.value === '__skip__')
      }
    }
    assert.equal(response.state.roundPhase, 'returning-home')
    assert.equal(response.state.events.some(event => event.round === 3 && event.type === 'work.ended'), false)
    if (card === 'E010_StrawHat') response = choose(session, response, option => option.labelKey === 'actions.move-farmer-to-space.name')
    else response = choose(session, response, option => !option.value.includes('skip'))
    const clayBefore = response.state.players[0]!.resources.clay
    const foodBefore = response.state.players[0]!.resources.food
    response = choose(session, response, option => option.value === 'forest')
    assert.equal(response.state.players[0]!.resources.clay - clayBefore, priorUses + 1)
    assert.equal(response.state.players[0]!.resources.wood, priorUses ? 5 : 4)
    assert.equal(response.state.players[0]!.resources.food, foodBefore, 'movement must not trigger Catcher')
    const movedUse = response.state.events.findLast(event => event.type === 'actionSpace.useStarted' && event.spaceId === 'forest')
    assert.ok(movedUse?.type === 'actionSpace.useStarted' && movedUse.workPhase && !movedUse.newPlacement)
    assert.equal(response.state.events.filter(event => event.round === 3 && event.type === 'work.ended').length, 1)
    assert.equal(response.scores.length, 5)
    evidence.record(`${card}-${priorUses}`, { state: response.state, interaction: response.interaction, scores: response.scores })
    response = handoffs(session, response)
    assert.equal(response.state.round, 4)
    assert.equal(response.state.roundPhase, 'work')
    advanceToOwner(session)
    const nextClay = response.state.players[0]!.resources.clay
    response = ok(session.takeAction(0, 'forest'))
    assert.equal(response.state.players[0]!.resources.clay - nextClay, 1)
  })

  it('excludes a start-return-home granted wood use after work qualification closes', () => {
    const session = opening(state => {
      state.round = 3
      state.players[0]!.occupationPlayed = [WOOD]
      state.players[0]!.minorPlayed = [PROBE]
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
    })
    session.withCtx(() => requireActiveCardRegistry('return-home-use-test').registerEffects([{
      id: PROBE, onStartReturnHome: () => ({ ...jumpLeaf({ sourceCard: PROBE, targetSpaceId: 'forest' }), optional: true }),
    }]))
    let response = session.getState()
    for (let step = 0; step < 15; step++) {
      response = handoffs(session, response)
      if (response.state.roundPhase !== 'work') break
      const actor = response.state.currentPlayerIndex
      const available = session.getActionAvailability(actor)
      const target = safeSpaces.find(id => available[id])
      assert.ok(target)
      response = ok(session.takeAction(actor, target))
      if (response.state.roundPhase === 'work' && options(response).some(option => option.value === '__skip__')) response = choose(session, response, option => option.value === '__skip__')
    }
    assert.equal(response.state.roundPhase, 'returning-home')
    assert.equal(response.state.events.filter(event => event.round === 3 && event.type === 'work.ended').length, 1)
    response = choose(session, response, option => option.value !== '__skip__')
    const completed = response.state.events.filter(event => event.round === 3 && event.type === 'actionSpace.useStarted' && event.spaceId === 'forest')
    assert.equal(completed.length, 1)
    assert.ok(completed[0]?.type === 'actionSpace.useStarted' && !completed[0].workPhase)
    assert.equal(response.state.players[0]!.resources.clay, 0)
    assert.equal(response.state.players[0]!.resources.wood, 3)
  })
})
