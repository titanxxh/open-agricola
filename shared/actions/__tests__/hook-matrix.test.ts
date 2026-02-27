import { beforeEach, describe, expect, it } from 'vitest'
import { actionDefinitions } from '../index'
import { actionHookPhases } from '../hooks'
import { buildHookMatrix } from '../hook-matrix'
import {
  clearActionHooks,
  registerActionHook,
  type ActionHookRegistration,
} from '../hooks'
import {
  clearCardListeners,
  registerCardListener,
  type CardListenerRegistration,
} from '../../cards/card-listeners'

describe('hook matrix', () => {
  beforeEach(() => {
    clearActionHooks()
    clearCardListeners()
  })

  it('collects phases from action hooks only', () => {
    registerActionHook({
      id: 'test-before-after',
      actions: ['day-laborer'],
      phases: ['before', 'after'],
      handler: () => undefined,
    })
    const matrix = buildHookMatrix(actionDefinitions)
    const dayLaborer = matrix.find((entry) => entry.actionId === 'day-laborer')
    expect(dayLaborer?.phases).toEqual(['before', 'after'])
  })

  it('collects phases from card listeners', () => {
    registerCardListener({
      id: 'listener-compute-args',
      actions: ['day-laborer'],
      phases: ['computeArgs'],
      handler: () => undefined,
    })
    const matrix = buildHookMatrix(actionDefinitions)
    const dayLaborer = matrix.find((entry) => entry.actionId === 'day-laborer')
    expect(dayLaborer?.phases).toEqual(['computeArgs'])
  })

  it('does not default to full phase coverage', () => {
    const matrix = buildHookMatrix(actionDefinitions)
    const dayLaborer = matrix.find((entry) => entry.actionId === 'day-laborer')
    expect(dayLaborer?.phases).toEqual([])
    expect(dayLaborer?.phases).not.toEqual(actionHookPhases)
  })

  it('is sensitive to hook removal', () => {
    const hook: ActionHookRegistration = {
      id: 'tmp-before',
      actions: ['day-laborer'],
      phases: ['before'],
      handler: () => undefined,
    }
    const listener: CardListenerRegistration = {
      id: 'tmp-after',
      actions: ['day-laborer'],
      phases: ['after'],
      handler: () => undefined,
    }
    registerActionHook(hook)
    registerCardListener(listener)
    const withHooks = buildHookMatrix(actionDefinitions)
    const beforeClear = withHooks.find((entry) => entry.actionId === 'day-laborer')
    expect(beforeClear?.phases).toEqual(['before', 'after'])

    clearActionHooks()
    clearCardListeners()
    const withoutHooks = buildHookMatrix(actionDefinitions)
    const afterClear = withoutHooks.find((entry) => entry.actionId === 'day-laborer')
    expect(afterClear?.phases).toEqual([])
  })

  it('keeps deterministic phase order', () => {
    registerActionHook({
      id: 'order-z',
      actions: ['day-laborer'],
      phases: ['after'],
      handler: () => undefined,
    })
    registerActionHook({
      id: 'order-a',
      actions: ['day-laborer'],
      phases: ['before'],
      handler: () => undefined,
    })
    registerCardListener({
      id: 'order-listener',
      actions: ['day-laborer'],
      phases: ['computeArgs'],
      handler: () => undefined,
    })
    const matrix = buildHookMatrix(actionDefinitions)
    const dayLaborer = matrix.find((entry) => entry.actionId === 'day-laborer')
    expect(dayLaborer?.phases).toEqual(['before', 'after', 'computeArgs'])
  })
})
