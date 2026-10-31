import { describe, expect, it } from 'vitest'
import { CardRegistry, type CardImpl } from '../registry'
import { moorSpecialActionCardDefinitions } from '../../moor/special-action-cards'
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
    {}, { actions: [] }, { actions: ['*'] },
    ...['immediatelyAfter', 'computeArgs', 'computeCosts', 'isDoable', 'computeReplace', 'anytime'].flatMap(phase => [
      { actions: ['moor-action'], phases: ['before', phase] }, { actions: ['moor-action', 'collect'], phases: ['after', phase] },
    ]), { actions: ['unknown'] }, { actions: ['store-on-card'] },
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
    { actions: ['collect'], settlement: 'unknown' },
    { actions: ['collect'], settlement: ['body'] },
    { actions: ['collect'], settlement: { toString: () => 'action' } },
    { actions: ['collect'], settlement: 'action', phases: ['before'] },
    { actions: ['collect'], settlement: 'body' },
    { actions: ['collect'], settlement: 'body', mandatory: true, phases: ['immediatelyAfter'] },
    { actionSpaces: ['fishing'], settlement: 'action' },
    { events: ['farm.sown'], settlement: 'body', mandatory: true },
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

  it.each(['action', 'body', 'completion'] as const)('rejects the removed %s settlement option', settlement => {
    const registry = new CardRegistry()
    expect(() => Reflect.apply(registry.registerListener, registry, [{ ...valid(), settlement, mandatory: true }])).toThrow(/settlement/)
    expect(registry.getAllListeners()).toEqual([])
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

  it.each(['loadImpl', 'addListener', 'registerListener', 'session'] as const)('%s rejects every concrete Moor target, including mixed subscriptions', entry => {
    const targets = [...new Set(moorSpecialActionCardDefinitions.flatMap(card => card.actions))]
    for (const target of targets) for (const actions of [[target], ['moor-action', target], ['collect', target]]) {
      const registry = new CardRegistry(), session = new SessionCardContext()
      const listener = { ...valid(), actions }
      const register = () => {
        if (entry === 'loadImpl') Reflect.apply(registry.loadImpl, registry, ['TEST_Listener', { listeners: [valid(), listener] }])
        else if (entry === 'addListener') Reflect.apply(registry.addListener, registry, ['TEST_Listener', listener])
        else if (entry === 'registerListener') Reflect.apply(registry.registerListener, registry, [listener])
        else Reflect.apply(session.registerListener, session, [listener])
      }
      expect(register, `${entry}: ${actions.join(',')}`).toThrow(/unsupported action target/)
      expect(registry.getAllListeners()).toEqual([])
      expect(session.customListeners).toEqual([])
    }
  })

  it.each(['before', 'after'] as const)('dispatches unified Moor and collect at %s after freezing, clone and merge', phase => {
    for (const frozen of [false, true]) {
      const registry = new CardRegistry()
      const input = { ...valid(), actions: ['moor-action', 'collect'], phases: [phase] }
      if (frozen) { Object.freeze(input.actions); Object.freeze(input.phases); Object.freeze(input) }
      Reflect.apply(registry.loadImpl, registry, ['TEST_Listener', { listeners: [input] }])
      if (frozen) expect(() => input.actions.push('sow')).toThrow()
      else { input.actions.push('sow'); input.phases.push(phase) }
      const merged = new CardRegistry()
      merged.mergeFrom(registry.clone())
      for (const current of [registry, registry.clone(), merged]) {
        const state = createInitialState(42, { playerCount: 2 })
        state.players[0]!.minorPlayed = ['TEST_Listener']
        expect(() => current.getAllListeners()[0]!.actions?.push('sow')).toThrow()
        const context = { actionHooks: undefined, state, player: state.players[0]!, space: state.actionSpaces[0]!, phase }
        for (const actionId of ['moor-action', 'collect']) expect(withActiveRegistry(current, () => runCardListeners({
          ...context, actionId,
        }, current.getAllListeners()))).toEqual([{ flow: { type: 'leaf', actionId: 'gain', params: { food: 2 } } }])
        for (const actionId of moorSpecialActionCardDefinitions.flatMap(card => card.actions)) expect(withActiveRegistry(current, () => runCardListeners({
          ...context, actionId,
        }, current.getAllListeners()))).toEqual([])
      }
    }
  })

  it('rejects a late invalid batch without replacing existing listeners, effects or prerequisites', () => {
    const registry = new CardRegistry()
    const existing = { listeners: [valid()], effect: { id: 'TEST_Listener', onBuy: () => undefined }, prerequisiteCheck: () => false,
      getBaseCosts: () => ({ wood: 2 }),
      modifiers: [{ type: 'trade', cardId: 'TEST_Listener', appliesTo: ['occupation'], from: { wood: 1 }, to: { food: 1 } }],
    } satisfies CardImpl
    registry.loadImpl('TEST_Listener', existing)
    const before = registry.getAllListeners()
    expect(() => Reflect.apply(registry.loadByIds, registry, [
      ['TEST_Listener', 'TEST_Invalid'], (id: string) => id === 'TEST_Listener'
        ? { listeners: [{ ...valid(), id: 'replacement' }] }
        : { listeners: [{ ...valid(), actions: ['cut-peat'] }] },
    ])).toThrow(/unsupported action target/)
    expect(registry.getAllListeners()).toEqual(before)
    expect(registry.getEffect('TEST_Listener')?.onBuy).toBe(existing.effect.onBuy)
    expect(registry.getPrerequisiteCheck('TEST_Listener')).toBe(existing.prerequisiteCheck)
    expect(registry.getModifiers('TEST_Listener')).toEqual(existing.modifiers)
    expect(registry.getBaseCosts('TEST_Listener')).toBe(existing.getBaseCosts)
    expect(registry.getListenersFor('TEST_Invalid')).toEqual([])
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
