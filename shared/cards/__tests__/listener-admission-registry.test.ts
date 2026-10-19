import { describe, expect, it } from 'vitest'
import { CardRegistry } from '../registry'
import { SessionCardContext } from '../session-card-context'
import type { CardListenerRegistration } from '../card-listeners'
import { runCardListeners } from '../card-listeners'
import { createInitialState } from '../../session/state-bootstrap'
import { withActiveRegistry } from '../active-registry'

const valid = (): CardListenerRegistration => ({
  id: 'legal', cardIds: ['TEST_Listener'], actions: ['collect'], phases: ['after'],
  handler: () => ({ flow: { type: 'leaf', actionId: 'gain', params: { food: 2 } } }),
})

describe('listener registration admission', () => {
  it.each(['loadImpl', 'addListener', 'registerListener', 'session'] as const)('%s rejects an internal execution target without installing it', entry => {
    const listener: CardListenerRegistration = { ...valid(), actions: ['collect', 'special-effect'] }
    const registry = new CardRegistry()
    const session = new SessionCardContext()
    const register = () => {
      if (entry === 'loadImpl') registry.loadImpl('TEST_Listener', { listeners: [valid(), listener] })
      else if (entry === 'addListener') registry.addListener('TEST_Listener', listener)
      else if (entry === 'registerListener') registry.registerListener(listener)
      else session.registerListener(listener)
    }
    expect(register).toThrow(/listener|target/i)
    expect(registry.getAllListeners()).toEqual([])
    expect(session.customListeners).toEqual([])
  })

  it.each([
    {}, { actions: [] }, { actions: ['unknown'] }, { actions: ['store-on-card'] },
    { actions: ['take-from-card'] }, { actions: ['pop-card-stack'] }, { actions: ['spend-worker'] },
    { actions: ['special-effect'] }, { actions: ['harvest-feed-conversion'] }, { actions: ['selection'] },
    { actions: ['collect'], phases: [] }, { actions: ['collect'], phases: ['anytime'] },
    { actions: ['place-farmer'], phases: ['immediatelyAfter'] },
    { actions: ['trade-applied'], phases: ['after'] },
    { actions: ['collect'], events: ['farm.sown'] },
    { events: [] }, { events: ['unknown'] }, { events: ['farm.sown'], phases: ['before'] },
    { globalQuery: false }, { globalQuery: true, phases: ['after'] },
    { globalQuery: true, actions: ['collect'], phases: ['isDoable'] },
  ])('rejects malformed or unsupported subscription %j', declaration => {
    const registry = new CardRegistry()
    expect(() => Reflect.apply(registry.registerListener, registry, [{ id: 'invalid', phases: ['after'], ...declaration }])).toThrow(/Listener/)
    expect(registry.getAllListeners()).toEqual([])
  })

  it('snapshots input and getter values so mutations cannot change dispatch after clone and merge', () => {
    const registry = new CardRegistry()
    const input = valid()
    registry.loadImpl('TEST_Listener', { listeners: [input] })
    input.actions?.push('sow')
    input.phases?.push('before')
    input.cardIds?.push('OTHER')
    input.handler = () => ({ doable: false })
    const copy = registry.clone()
    const merged = new CardRegistry()
    merged.mergeFrom(copy)
    for (const current of [registry, copy, merged]) {
      const retrieved = current.getListenersFor('TEST_Listener')
      expect(() => retrieved[0]!.actions?.push('sow')).toThrow()
      expect(() => { retrieved[0]!.handler = () => ({ doable: false }) }).toThrow()
      retrieved.length = 0
      current.getAllListeners().length = 0
      const state = createInitialState(42, { playerCount: 2 })
      state.players[0]!.minorPlayed = ['TEST_Listener']
      const context = { actionHooks: undefined, state, player: state.players[0]!, space: state.actionSpaces[0]!, phase: 'after' as const }
      expect(withActiveRegistry(current, () => runCardListeners({ ...context, actionId: 'collect' }, current.getAllListeners()))).toEqual([
        { flow: { type: 'leaf', actionId: 'gain', params: { food: 2 } } },
      ])
      expect(withActiveRegistry(current, () => runCardListeners({ ...context, actionId: 'sow' }, current.getAllListeners()))).toEqual([])
    }
  })

  it('retains an explicit global doability query while rejecting global reactions', () => {
    const registry = new CardRegistry()
    registry.registerListener({ id: 'query', globalQuery: true, phases: ['isDoable'], handler: () => ({ doable: false }) })
    const state = createInitialState(42, { playerCount: 2 })
    expect(runCardListeners({ actionHooks: undefined, state, player: state.players[0]!, space: state.actionSpaces[0]!,
      actionId: 'grain-utilization', phase: 'isDoable' }, registry.getAllListeners())).toEqual([{ doable: false }])
  })
})
