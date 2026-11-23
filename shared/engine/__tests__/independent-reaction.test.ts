import { describe, expect, it } from 'vitest'
import type { ActionFlow } from '../../contract/types'
import { isIndependentReactionFlow, isIndependentReactionResult } from '../independent-reaction'

const gain = (params: Record<string, number>): ActionFlow => ({ type: 'leaf', actionId: 'gain', params })

describe('independent reactions (#2039)', () => {
  it.each<[string, ActionFlow]>([
    ['a non-animal gain', gain({ food: 2, wood: 1 })],
    ['a gain then card storage', { type: 'seq', children: [gain({ food: 1 }), { type: 'leaf', actionId: 'store-on-card', params: { food: 1 } }] }],
    ['goods taken from a card', { type: 'leaf', actionId: 'take-from-card', params: { stone: 1 } }],
    ['bonus points', { type: 'leaf', actionId: 'bonus-vp' }],
    ['a counter update', { type: 'leaf', actionId: 'special-effect', params: { kind: 'increment-counter', key: 'x', amount: 1 } }],
    ['an all-parallel of gains', { type: 'parallel', children: [gain({ food: 1 }), gain({ reed: 1 })] }],
  ])('treats %s as independent', (_label, flow) => {
    expect(isIndependentReactionFlow(flow)).toBe(true)
    expect(isIndependentReactionResult({ flow }, false)).toBe(true)
  })

  it.each<[string, ActionFlow]>([
    ['an animal gain', gain({ sheep: 1 })],
    ['a payment', { type: 'leaf', actionId: 'pay', params: { cost: { food: 1 } } }],
    ['an optional root', { ...gain({ food: 1 }), optional: true }],
    ['an optional child', { type: 'seq', children: [gain({ food: 1 }), { ...gain({ wood: 1 }), optional: true }] }],
    ['a choice', { type: 'xor', children: [gain({ wood: 1 }), gain({ clay: 1 })] }],
    ['a nested selector', { type: 'parallel', mode: 'trigger-select', children: [gain({ food: 1 })] }],
    ['a farm selection', { type: 'leaf', actionId: 'selection', actionContext: { selectionKind: 'farm-position' } }],
    ['a random draw leaf', { type: 'leaf', actionId: 'card_M104_WildHarvest_draw' }],
    ['other card effects', { type: 'leaf', actionId: 'special-effect', params: { kind: 'move-major-improvement-to-top' } }],
  ])('treats %s as needing the player', (_label, flow) => {
    expect(isIndependentReactionFlow(flow)).toBe(false)
  })

  it('needs a flow from a listener, but accepts a stage effect that only changes state', () => {
    expect(isIndependentReactionResult({ doable: true }, false)).toBe(false)
    expect(isIndependentReactionResult({ doable: true }, true)).toBe(true)
    expect(isIndependentReactionResult(undefined, true)).toBe(false)
    expect(isIndependentReactionResult({ flow: gain({ food: 1 }), followUpActions: [{ actionId: 'plow' } as never] }, false)).toBe(false)
  })
})
