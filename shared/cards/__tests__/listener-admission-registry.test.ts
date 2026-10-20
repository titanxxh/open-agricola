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
    const listener = { ...valid(), actions: ['collect', 'special-effect'] }
    const registry = new CardRegistry()
    const session = new SessionCardContext()
    const register = () => {
      if (entry === 'loadImpl') Reflect.apply(registry.loadImpl, registry, ['TEST_Listener', { listeners: [valid(), listener] }])
      else if (entry === 'addListener') Reflect.apply(registry.addListener, registry, ['TEST_Listener', listener])
      else if (entry === 'registerListener') Reflect.apply(registry.registerListener, registry, [listener])
      else Reflect.apply(session.registerListener, session, [listener])
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
    { actions: ['collect'], phases: undefined }, { actions: ['collect'], phases: null },
    { actions: ['collect'], phases: 3 }, { actions: ['collect'], phases: 'after' },
    { actions: ['place-farmer'], phases: ['immediatelyAfter'] },
    { actions: ['trade-applied'], phases: ['after'] },
    { actions: ['collect'], events: ['farm.sown'] },
    { events: [] }, { events: ['unknown'] }, { events: ['farm.sown'], phases: ['before'] },
    { globalQuery: false }, { globalQuery: true, phases: ['after'] },
    { globalQuery: true, actions: ['collect'], phases: ['isDoable'] },
    { actionSpaces: [] }, { actionSpaces: null }, { actionSpaces: 3 }, { actionSpaces: '*' },
    { actionSpaces: 'fishing' }, { actionSpaces: ' all ' },
    { actionSpaces: [''] }, { actionSpaces: ['  '] }, { actionSpaces: [3] },
    { actionSpaces: ['fishing'], actions: ['collect'] },
    { actionSpaces: ['fishing'], events: ['farm.sown'] },
    { actionSpaces: ['fishing'], globalQuery: true, phases: ['isDoable'] },
    ...['computeArgs', 'computeCosts', 'computeChoiceCandidates', 'anytime'].map(phase => ({ actionSpaces: ['fishing'], phases: [phase] })),
    { actionSpaces: 'all', actions: ['collect'] },
    { actionSpaces: 'all', events: ['farm.sown'] },
    { actionSpaces: 'all', globalQuery: true, phases: ['isDoable'] },
  ])('rejects malformed or unsupported subscription %j', declaration => {
    const registry = new CardRegistry()
    expect(() => Reflect.apply(registry.registerListener, registry, [{ id: 'invalid', phases: ['after'], ...declaration }])).toThrow(/Listener/)
    expect(registry.getAllListeners()).toEqual([])
  })

  it('copies and freezes action space selectors through every registration entry and clone/merge', () => {
    for (const entry of ['loadImpl', 'addListener', 'registerListener', 'session']) {
      const registry = new CardRegistry(), session = new SessionCardContext()
      const actionSpaces = ['fishing']
      const input: CardListenerRegistration = { id: 'space', actionSpaces, phases: ['before'] }
      if (entry === 'loadImpl') registry.loadImpl('TEST_Listener', { listeners: [input] })
      else if (entry === 'addListener') registry.addListener('TEST_Listener', input)
      else if (entry === 'registerListener') registry.registerListener(input)
      else session.registerListener(input)
      actionSpaces.push('forest')
      const merged = new CardRegistry()
      merged.mergeFrom(registry.clone())
      const saved = [...registry.getAllListeners(), ...merged.getAllListeners(), ...session.customListeners]
      expect(saved.map(installed => installed.actionSpaces)).toEqual(entry === 'session' ? [['fishing']] : [['fishing'], ['fishing']])
      for (const installed of saved) {
        expect(installed.actionSpaces).toEqual(['fishing'])
        expect(() => { if (Array.isArray(installed.actionSpaces)) installed.actionSpaces.push('forest') }).toThrow()
      }
    }
  })

  it.each(['before', 'immediatelyAfter', 'after', 'computeReplace', 'isDoable'] as const)('admits explicit IDs and all at the action-space %s boundary', phase => {
    for (const actionSpaces of ['all', ['fishing']] as const) {
      const registry = new CardRegistry(), session = new SessionCardContext()
      const selector = actionSpaces === 'all' ? actionSpaces : [...actionSpaces]
      const input: CardListenerRegistration = { id: 'space', actionSpaces: selector, phases: [phase] }
      registry.loadImpl('TEST_Listener', { listeners: [input] })
      registry.addListener('TEST_Listener', { ...input, id: 'added' })
      registry.registerListener({ ...input, id: 'registered' })
      session.registerListener(input)
      const merged = new CardRegistry()
      merged.mergeFrom(registry.clone())
      for (const saved of [...registry.getAllListeners(), ...merged.getAllListeners(), ...session.customListeners]) {
        expect(saved.actionSpaces).toEqual(selector)
        expect(saved.phases).toEqual([phase])
      }
    }
  })

  it.each(['black-market', 'cut-peat', 'fell-trees', 'hiring-fair', 'horse-market', 'illicit-work', 'slash-and-burn'] as const)(
    'preserves %s as a Moor rule action', actionId => {
      const registry = new CardRegistry()
      registry.registerListener({ ...valid(), actions: [actionId], phases: ['before'] })
      const state = createInitialState(42, { playerCount: 2 })
      state.players[0]!.minorPlayed = ['TEST_Listener']
      expect(withActiveRegistry(registry, () => runCardListeners({
        actionHooks: undefined, state, player: state.players[0]!, space: state.actionSpaces[0]!, actionId, phase: 'before',
      }, registry.getAllListeners()))).toEqual([{ flow: { type: 'leaf', actionId: 'gain', params: { food: 2 } } }])
    },
  )

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

  it('dispatches one shared multi-card registration once for each owner card after snapshotting', () => {
    const registry = new CardRegistry()
    registry.registerListener({ ...valid(), cardIds: ['TEST_One', 'TEST_Two'] })
    const state = createInitialState(42, { playerCount: 2 })
    const player = state.players[0]!
    player.minorPlayed = ['TEST_One', 'TEST_Two']
    expect(withActiveRegistry(registry, () => runCardListeners({ actionHooks: undefined, state, player,
      space: state.actionSpaces[0]!, actionId: 'collect', phase: 'after' }))).toEqual([
      { flow: { type: 'leaf', actionId: 'gain', params: { food: 2 } } },
      { flow: { type: 'leaf', actionId: 'gain', params: { food: 2 } } },
    ])
  })
})
