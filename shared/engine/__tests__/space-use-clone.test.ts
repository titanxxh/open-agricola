import { expect, it } from 'vitest'
import { installOfficialCardRegistry } from '../../cards/__tests__/card-environment'
import { requireActiveCardRegistry } from '../../cards/active-registry'
import { gainAction } from '../../actions/effects/gain'
import { ActionHookRegistry } from '../../actions/hooks'
import { Engine } from '../engine'
import { ActionRegistry } from '../registry'
import { HookDispatcher } from '../dispatcher'
import { LogStore } from '../log-store'
import { cloneNode } from '../engine-utils'
import { asActionSpace, makeEventTestState } from './event-test-helpers'
import { createInitialPlayerStats } from '../../session/stats'

installOfficialCardRegistry()

it('executes the cloned scope body and its completion reaction using the cloned identities', () => {
  const card = 'TEST_ClonedSpaceAfter'
  const state = makeEventTestState()
  const player = state.players[0]!
  player.minorPlayed = [card]
  player.stats = createInitialPlayerStats({ isFirstPlayer: false })
  const forest = asActionSpace({ ...gainAction, id: 'forest' })
  state.actionSpaces = [forest]
  const registry = new ActionRegistry()
  registry.register(forest)
  registry.register(gainAction)
  const actionHooks = new ActionHookRegistry()
  const deps = { registry, hooks: new HookDispatcher(actionHooks), log: new LogStore() }
  requireActiveCardRegistry('clone-space-test').registerListener({
    id: card, cardIds: [card], actionSpaces: ['forest'], phases: ['after'],
    handler: () => ({ sourceCard: card, flow: { type: 'leaf', actionId: 'gain', sourceCard: card, params: { clay: 1 } } }),
  })
  const original = Engine.fromFlow({ type: 'leaf', actionId: 'forest', params: { wood: 3 },
    spaceUse: { newPlacement: false } }, deps, player.id)
  const cloned = Engine.fromRoot(cloneNode(original._internals(), original._internals().tree.root), deps)
  const context = { state, player, space: forest, actionHooks }
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
