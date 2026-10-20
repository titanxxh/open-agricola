import { expect, it } from 'vitest'
import { installOfficialCardRegistry } from '../../cards/__tests__/card-environment'
import { requireActiveCardRegistry } from '../../cards/active-registry'
import { createTriggerSnapshot } from '../../cards/helpers/trigger-snapshot'
import { gainAction } from '../../actions/effects/gain'
import { ActionHookRegistry } from '../../actions/hooks'
import { Engine } from '../engine'
import { ActionRegistry } from '../registry'
import { HookDispatcher } from '../dispatcher'
import { LogStore } from '../log-store'
import { cloneNode } from '../engine-utils'
import { asActionSpace, makeEventTestState } from './event-test-helpers'
import { createInitialPlayerStats } from '../../session/stats'
import type { MoorCompletionFrame } from '../../moor/completion-types'

installOfficialCardRegistry()

it('clones and JSON restores the Moor body, frozen sources, payload and original terrain receipt independently', () => {
  const card = 'TEST_ClonedMoorAfter'
  const state = makeEventTestState()
  const player = state.players[0]!
  player.minorPlayed = [card]
  player.stats = createInitialPlayerStats({ isFirstPlayer: false })
  const space = asActionSpace({ ...gainAction, id: 'forest' })
  state.actionSpaces = [space]
  const registry = new ActionRegistry()
  registry.register(gainAction)
  const actionHooks = new ActionHookRegistry()
  const deps = { registry, hooks: new HookDispatcher(actionHooks), log: new LogStore() }
  requireActiveCardRegistry('clone-moor-test').registerListener({
    id: card, cardIds: [card], actions: ['moor-action'], phases: ['after'],
    handler: context => context.actionId === 'moor-action' && context.moorAction?.actionId === 'cut-peat'
      && JSON.stringify(context.moorAction?.payload) === '{"tile":{"row":2,"col":0}}'
      && context.actionEvents?.some(event => event.type === 'farm.terrainChanged'
        && event.sourceActionId === 'cut-peat' && event.changes.some(change => change.row === 2 && change.col === 0))
      ? { sourceCard: card, flow: { type: 'leaf', actionId: 'gain', sourceCard: card, params: { clay: 1 } } } : undefined,
  })
  const frame: MoorCompletionFrame = {
    result: { type: 'ok' }, actionId: 'cut-peat', payload: { tile: { row: 2, col: 0 } }, playerId: player.id,
    terrainEvent: { type: 'farm.terrainChanged', playerId: player.id, operation: 'remove', sourceActionId: 'cut-peat',
      changes: [{ row: 2, col: 0, before: { kind: 'moor' }, after: null }], newlyUsedTiles: [] },
    sources: [{ listenerId: card, cardId: card, ownerPlayerId: player.id, ownerCardZone: 'played' }],
    triggerSnapshot: createTriggerSnapshot(state),
  }
  const original = Engine.fromFlow({ type: 'seq', children: [{ type: 'leaf', actionId: 'gain', params: { wood: 3 } }],
    moorCompletion: frame }, deps, player.id)
  const cloned = Engine.fromRoot(cloneNode(original._internals(), original._internals().tree.root), deps)
  frame.payload.tile = { row: 2, col: 4 }
  frame.sources.length = 0
  frame.terrainEvent!.changes.length = 0
  cloned.restore(JSON.parse(JSON.stringify(cloned.snapshot())))
  const context = { state, player, space, actionHooks }
  let done = false
  for (let step = 0; step < 20; step++) {
    const result = cloned.proceed(context)
    if (result.type === 'done') { done = true; break }
    expect(result.type).toBe('ok')
  }
  expect(done).toBe(true)
  expect(player.resources).toMatchObject({ wood: 3, clay: 1 })
  expect(state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === card)).toHaveLength(1)
})

it('finishes a nested action-space completion before its enclosing Moor body continues after clone and restore', () => {
  const outerCard = 'TEST_OuterMoorAfter', innerCard = 'TEST_InnerSpaceAfter'
  const state = makeEventTestState()
  const player = state.players[0]!
  player.minorPlayed = [outerCard, innerCard]
  player.stats = createInitialPlayerStats({ isFirstPlayer: false })
  const forest = asActionSpace({ ...gainAction, id: 'forest' })
  state.actionSpaces = [forest]
  const registry = new ActionRegistry()
  registry.register(forest)
  registry.register(gainAction)
  const actionHooks = new ActionHookRegistry()
  const deps = { registry, hooks: new HookDispatcher(actionHooks), log: new LogStore() }
  const cards = requireActiveCardRegistry('nested-moor-test')
  cards.registerListener({ id: outerCard, cardIds: [outerCard], actions: ['moor-action'], phases: ['after'],
    handler: () => ({ sourceCard: outerCard, flow: { type: 'leaf', actionId: 'gain', sourceCard: outerCard, params: { stone: 1 } } }) })
  cards.registerListener({ id: innerCard, cardIds: [innerCard], actionSpaces: ['forest'], phases: ['after'],
    handler: () => ({ sourceCard: innerCard, flow: { type: 'leaf', actionId: 'gain', sourceCard: innerCard, params: { clay: 1 } } }) })
  const original = Engine.fromFlow({ type: 'seq', children: [
    { type: 'leaf', actionId: 'forest', params: { wood: 3 }, spaceUse: { newPlacement: false } },
    { type: 'leaf', actionId: 'gain', params: { food: 1 } },
  ], moorCompletion: { result: { type: 'ok' }, actionId: 'hiring-fair', playerId: player.id, payload: {},
    sources: [{ listenerId: outerCard, cardId: outerCard, ownerPlayerId: player.id, ownerCardZone: 'played' }],
    triggerSnapshot: createTriggerSnapshot(state) } }, deps, player.id)
  const cloned = Engine.fromRoot(cloneNode(original._internals(), original._internals().tree.root), deps)
  cloned.restore(JSON.parse(JSON.stringify(cloned.snapshot())))
  let done = false
  for (let step = 0; step < 30; step++) {
    const result = cloned.proceed({ state, player, space: forest, actionHooks })
    if (result.type === 'done') { done = true; break }
    expect(result.type).toBe('ok')
  }
  expect(done).toBe(true)
  expect(player.resources).toMatchObject({ wood: 3, clay: 1, food: 1, stone: 1 })
  expect(state.events.filter(event => event.type === 'resource.moved').map(event => event.resources))
    .toEqual([{ wood: 3 }, { clay: 1 }, { food: 1 }, { stone: 1 }])
})
