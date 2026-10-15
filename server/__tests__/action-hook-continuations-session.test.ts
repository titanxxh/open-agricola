import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { fenceAction } from '../../shared/actions/effects/fencing'
import { ActionNode, ActionRegistry, Engine, EngineTree, HookDispatcher, LogStore } from '../../shared/engine'

const sessions: ReturnType<typeof createWorkSession>[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

describe('owning action rules in before continuations', () => {
  it('resumes two fencing before reactions through a real Session snapshot', () => {
    const cards = ['__before_fence_a__', '__before_fence_b__']
    const session = createWorkSession({ configure: state => {
      state.round = 14
      state.players[0]!.occupationPlayed = cards
      state.players[0]!.resources.wood = 6
    } })
    sessions.push(session)
    session.withCtx(() => {
      for (const card of cards) requireActiveCardRegistry('before fencing test').registerListener({
        id: card, cardIds: [card], actions: ['fence'], phases: ['before'],
        handler: () => ({ flow: { type: 'leaf', actionId: 'gain', sourceCard: card, params: { food: 1 } } }),
      })
    })
    const food = session.state.players[0]!.resources.food
    const offered = session.takeAction(0, 'fencing')
    expect(offered.ok, offered.error).toBe(true)
    expect(offered.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'select-trigger' } })
    expect(session.loadState(rehydrateState(serializeSessionSnapshot(offered.state, session))).ok).toBe(true)
    let resolved = session.resolveChoice(0, cards[0]!)
    expect(resolved.ok, resolved.error).toBe(true)
    if (resolved.interaction.stateId === 'wait' && resolved.interaction.request.kind === 'select-trigger') {
      resolved = session.resolveChoice(0, cards[1]!)
    }
    expect(resolved.ok, resolved.error).toBe(true)
    expect(resolved.state.players[0]!.resources.food).toBe(food + 2)
    expect(resolved.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'farm-select', farm: { farmType: 'fence' } } })
  })

  it('uses current session costs when probing a mandatory fence after Engine restoration', () => {
    const session = createWorkSession({ configure: state => { state.players[0]!.resources.wood = 4 } })
    sessions.push(session)
    const registry = new ActionRegistry()
    registry.register(fenceAction)
    const node = new ActionNode('mandatory-fence', 'fence')
    node.mandatory = true
    node.beforePhaseResolved = true
    const build = () => new Engine({ tree: new EngineTree(node), registry, hooks: new HookDispatcher(session.actionHooks), log: new LogStore() })
    const original = build()
    const restored = build()
    restored.restore(original.snapshot())
    const space = session.state.actionSpaces.find(space => space.id === 'fencing')!
    const probe = () => session.withCtx(() => restored.probeMandatoryContinuations(session.state, space, session.state.players[0]!.id))
    expect(probe()).toEqual([{ nodeId: node.id, actionId: 'fence', ownerPlayerId: session.state.players[0]!.id, strictDoable: true }])
    session.state.players[0]!.resources.wood = 0
    expect(probe()).toEqual([{ nodeId: node.id, actionId: 'fence', ownerPlayerId: session.state.players[0]!.id, strictDoable: false }])
    session.actionHooks.register({ id: 'test:probe-fence-price', actions: ['fence'], phases: ['computeCosts'], handler: () => ({ costs: { wood: -4 } }) })
    expect(probe()).toEqual([{ nodeId: node.id, actionId: 'fence', ownerPlayerId: session.state.players[0]!.id, strictDoable: true }])
  })
})
