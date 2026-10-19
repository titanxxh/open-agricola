import { beforeEach, describe, expect, it } from 'vitest'
import { gainAction } from '../effects/gain'
import { ActionHookRegistry, actionHookPhases } from '../hooks'
import { buildHookMatrix } from '../hook-matrix'
import { type ActionHookRegistration } from '../hooks'
import { type CardListenerRegistration } from '../../cards/card-listeners'
import { CardRegistry } from '../../../shared/cards/registry'
import { setActiveCardRegistry, requireActiveCardRegistry } from '../../../shared/cards/active-registry'

const actionHooks = new ActionHookRegistry()
const matrixActions = [gainAction]


describe('hook matrix', () => {
  beforeEach(() => {
    actionHooks.clear()
    setActiveCardRegistry(new CardRegistry())
  })

  it('collects phases from action hooks only', () => {
    actionHooks.register({
      id: 'test-before-after',
      actions: ['gain'],
      phases: ['before', 'after'],
      handler: () => undefined,
    })
    const matrix = buildHookMatrix(matrixActions, actionHooks.getRegistered())
    const gainEntry = matrix.find((entry) => entry.actionId === 'gain')
    expect(gainEntry?.phases).toEqual(['before', 'after'])
  })

  it('collects phases from card listeners', () => {
    requireActiveCardRegistry('hook-matrix').registerListener({
      id: 'listener-compute-args',
      actions: ['gain'],
      phases: ['computeArgs'],
      handler: () => undefined,
    })
    const matrix = buildHookMatrix(matrixActions, actionHooks.getRegistered())
    const gainEntry = matrix.find((entry) => entry.actionId === 'gain')
    expect(gainEntry?.phases).toEqual(['computeArgs'])
  })

  it('does not default to full phase coverage', () => {
    const matrix = buildHookMatrix(matrixActions, actionHooks.getRegistered())
    const gainEntry = matrix.find((entry) => entry.actionId === 'gain')
    expect(gainEntry?.phases).toEqual([])
    expect(gainEntry?.phases).not.toEqual(actionHookPhases)
  })

  it('keeps domain events out of action rows and includes explicit global queries', () => {
    const registry = requireActiveCardRegistry('hook-matrix')
    registry.registerListener({ id: 'sown', events: ['farm.sown'], phases: ['after'], handler: () => undefined })
    expect(buildHookMatrix(matrixActions, [])).toEqual([{ actionId: 'gain', phases: [] }])
    registry.registerListener({ id: 'global-query', globalQuery: true, phases: ['isDoable'], handler: () => undefined })
    expect(buildHookMatrix(matrixActions, [])).toEqual([{ actionId: 'gain', phases: ['isDoable'] }])
  })

  it('is sensitive to hook removal', () => {
    const hook: ActionHookRegistration = {
      id: 'tmp-before',
      actions: ['gain'],
      phases: ['before'],
      handler: () => undefined,
    }
    const listener: CardListenerRegistration = {
      id: 'tmp-after',
      actions: ['gain'],
      phases: ['after'],
      handler: () => undefined,
    }
    actionHooks.register(hook)
    requireActiveCardRegistry('hook-matrix').registerListener(listener)
    const withHooks = buildHookMatrix(matrixActions, actionHooks.getRegistered())
    const beforeClear = withHooks.find((entry) => entry.actionId === 'gain')
    expect(beforeClear?.phases).toEqual(['before', 'after'])

    actionHooks.clear()
    setActiveCardRegistry(new CardRegistry())
    const withoutHooks = buildHookMatrix(matrixActions, actionHooks.getRegistered())
    const afterClear = withoutHooks.find((entry) => entry.actionId === 'gain')
    expect(afterClear?.phases).toEqual([])
  })

  it('keeps deterministic phase order', () => {
    actionHooks.register({
      id: 'order-z',
      actions: ['gain'],
      phases: ['after'],
      handler: () => undefined,
    })
    actionHooks.register({
      id: 'order-a',
      actions: ['gain'],
      phases: ['before'],
      handler: () => undefined,
    })
    requireActiveCardRegistry('hook-matrix').registerListener({
      id: 'order-listener',
      actions: ['gain'],
      phases: ['computeArgs'],
      handler: () => undefined,
    })
    const matrix = buildHookMatrix(matrixActions, actionHooks.getRegistered())
    const gainEntry = matrix.find((entry) => entry.actionId === 'gain')
    expect(gainEntry?.phases).toEqual(['before', 'after', 'computeArgs'])
  })
})
