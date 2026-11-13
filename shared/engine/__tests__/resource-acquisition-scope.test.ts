import { describe, expect, it } from 'vitest'
import type { ActionDefinition, ActionFlow, Resource } from '../../contract/types'
import { emptyResources } from '../../contract/state-constants'
import { getActionDefinition, internalActionDefinitions } from '../../actions'
import { ActionHookRegistry } from '../../actions/hooks'
import { ActionNode } from '../nodes'
import type { Engine } from '../engine'
import { withActiveRegistry } from '../../cards/active-registry'
import { CardRegistry } from '../../cards/registry'
import { E033_BeaverColony_impl } from '../../cards/E/E033_BeaverColony'
import { E077_Mattock_impl } from '../../cards/E/E077_Mattock'
import { E118_KindlingGatherer_impl } from '../../cards/E/E118_KindlingGatherer'
import { createInitialState } from '../../session/state-bootstrap'
import { asActionSpace, makeEventTestEngine } from './event-test-helpers'

const BEAVER = 'E033_BeaverColony'
const MATTOCK = 'E077_Mattock'
const KINDLING = 'E118_KindlingGatherer'

const acquisitionCards = () => {
  const cards = new CardRegistry()
  cards.loadImpl(BEAVER, E033_BeaverColony_impl)
  cards.loadImpl(MATTOCK, E077_Mattock_impl)
  cards.loadImpl(KINDLING, E118_KindlingGatherer_impl)
  return cards
}

const drain = (engine: Engine, context: Parameters<Engine['proceed']>[0]) => {
  let step = engine.proceed(context)
  for (let count = 0; count < 80 && step.type !== 'done'; count++) {
    expect(step.type).not.toBe('blocked')
    if (step.type === 'choice') {
      const request = engine.peekPendingEnvelope()!.request
      if (request.kind !== 'select-trigger' && request.kind !== 'choice') throw new Error(`Unexpected acquisition request: ${request.kind}`)
      const option = request.kind === 'select-trigger'
        ? request.options.find(entry => !entry.disabled && entry.value !== '__pass__')
        : request.options.find(entry => entry.value === 'finish')
      expect(option).toBeDefined()
      engine.flushEventTransaction(context)
      engine.restore(JSON.parse(JSON.stringify(engine.snapshot())))
      engine.resolveChoice(option!.value, context)
    }
    step = engine.proceed(context)
  }
  expect(step.type).toBe('done')
}

describe('Named gain actions use the standard acquisition settlement', () => {
  it.each([
    { id: 'day-laborer', goods: { food: 2 }, withRewards: { food: 2, wood: 1 }, vp: 0 },
    { id: 'resource-market-4', goods: { reed: 1, stone: 1, food: 1 }, withRewards: { reed: 1, stone: 1, food: 1, wood: 1, clay: 1 }, vp: 1 },
    { id: 'resource-market-56', goods: { reed: 1, stone: 1, wood: 1 }, withRewards: { reed: 1, stone: 1, wood: 1, clay: 1 }, vp: 1 },
    { id: 'grain-seeds', goods: { grain: 1 }, withRewards: { grain: 1 }, vp: 0 },
    { id: 'vegetable-seeds', goods: { vegetable: 1 }, withRewards: { vegetable: 1 }, vp: 0 },
  ].flatMap(scenario => ['card', 'space'].map(origin => ({ ...scenario, origin }))))(
    '$id keeps its fixed gain and $origin origin inside a different execution space',
    ({ id, goods, withRewards, vp, origin }) => {
      const state = createInitialState(1689, { playerCount: 2, ordinaryCardDeckSeed: 42, parentSelectionSeed: 42 })
      const player = state.players[0]!
      player.resources = { ...emptyResources }
      player.minorPlayed = [BEAVER, MATTOCK]
      player.occupationPlayed = [KINDLING]
      const named = getActionDefinition(id)!
      const actionHooks = new ActionHookRegistry()
      const node = new ActionNode('named-grant', id, 'Test_GrantedGain')
      if (origin === 'space') node.actionContext = { sourceLocation: { kind: 'actionSpace', spaceId: 'grain-seeds' } }
      const { engine } = makeEventTestEngine([named, ...internalActionDefinitions], node, actionHooks)
      const context = { actionHooks, state, player, space: state.actionSpaces.find(space => space.id === 'grain-seeds')! }
      withActiveRegistry(acquisitionCards(), () => drain(engine, context))
      expect(player.resources).toMatchObject({ ...emptyResources, ...(origin === 'space' ? withRewards : goods) })
      expect(player.cardStates[BEAVER]?.counters?.bonusVp ?? 0).toBe(origin === 'space' ? vp : 0)
      expect(state.events).toContainEqual(expect.objectContaining({
        type: 'resource.moved', resources: goods, sourceActionId: 'gain', sourceCardId: 'Test_GrantedGain',
        from: origin === 'space'
          ? { kind: 'actionSpace', spaceId: 'grain-seeds' }
          : { kind: 'card', playerId: player.id, cardId: 'Test_GrantedGain' },
      }))
      expect(state.events.filter(event => event.type === 'actionSpace.useStarted')).toEqual([])
      expect(context.space.takenBy).toEqual([])
    },
  )
})

describe('Resource acquisition completion scope', () => {
  it.each([
    { parentGoods: { grain: 1 }, expected: { grain: 1, reed: 1, food: 1, clay: 1, wood: 1 }, vp: 1 },
    { parentGoods: { reed: 2, food: 2 }, expected: { grain: 0, reed: 3, food: 3, clay: 2, wood: 2 }, vp: 2 },
  ].flatMap(scenario => ['collect', 'gain'].flatMap(parentActionId => ['flow', 'internal', 'request'].map(continuation => ({
    ...scenario, parentActionId, continuation,
  })))))(
    'does not replay child acquisitions from a $parentActionId / $continuation parent receipt: $parentGoods',
    ({ parentGoods, expected, vp, parentActionId, continuation }) => {
      const state = createInitialState(1689, { playerCount: 2, ordinaryCardDeckSeed: 42, parentSelectionSeed: 42 })
      const player = state.players[0]!
      player.resources = { ...emptyResources }
      player.minorPlayed = [BEAVER, MATTOCK]
      player.occupationPlayed = [KINDLING]
      const child: ActionFlow = {
        type: 'leaf', actionId: 'gain', params: { reed: 1, food: 1 },
        actionContext: { sourceLocation: { kind: 'actionSpace', spaceId: 'reed-bank' } },
      }
      // Infrastructure fixture: expose aggregate parent receipts, including a
      // child with the same action ID. This is not a production-card scenario.
      const parent: ActionDefinition = {
        id: parentActionId, nameKey: 'actions.collect.name', roundAvailable: 1, gainPerRound: {},
        canBeExecutedByPlayer: () => true,
        execute: context => {
          if (context.params?.fixtureParent !== true) return getActionDefinition(parentActionId)!.execute(context)
          for (const [resource, amount] of Object.entries(parentGoods)) context.player.resources[resource as keyof Resource] += amount
          context.eventSink.emit<'resource.moved'>({
            type: 'resource.moved', resources: parentGoods,
            from: { kind: 'actionSpace', spaceId: 'reed-bank' },
            to: { kind: 'player', playerId: player.id }, reason: 'collect',
          })
          if (continuation === 'request') return {
            type: 'request', promptKey: 'ui.interactionOptionalAction',
            request: { kind: 'choice', options: [{ value: 'finish', labelKey: 'ui.interactionOptionalAction' }] },
          }
          if (continuation === 'internal') return { type: 'ok', internalChildren: { beforeHostListeners: [{
            actionId: 'gain', params: { reed: 1, food: 1 },
            actionContext: { sourceLocation: { kind: 'actionSpace', spaceId: 'reed-bank' } },
          }] } }
          return { type: 'flow', flow: child }
        },
        ...(continuation === 'request' ? { resolveChoice: () => ({ type: 'flow' as const, flow: child }) } : {}),
      }
      const actionHooks = new ActionHookRegistry()
      const { engine } = makeEventTestEngine(
        [parent, ...internalActionDefinitions.filter(action => action.id !== parentActionId)],
        new ActionNode('parent', parentActionId, undefined, { fixtureParent: true }), actionHooks,
      )
      const context = { actionHooks, state, player, space: asActionSpace(parent) }
      withActiveRegistry(acquisitionCards(), () => drain(engine, context))
      expect(player.resources).toMatchObject(expected)
      expect(player.cardStates[BEAVER]?.counters?.bonusVp).toBe(vp)
      expect(state.events.filter(event => event.type === 'resource.moved' && event.from.kind === 'actionSpace')).toHaveLength(2)
    },
  )
})
