import { describe, it, expect } from 'vitest'
import { analyzeFlowInteractivity } from '../flow-interactivity'
import type { ActionFlow } from '../../contract/types'

describe('analyzeFlowInteractivity', () => {
  it('gain leaf is auto', () => {
    const f: ActionFlow = { type: 'leaf', actionId: 'gain', params: { wood: 1 } }
    expect(analyzeFlowInteractivity(f)).toBe('auto')
  })

  it('pay leaf with single resource cost is auto', () => {
    const f: ActionFlow = { type: 'leaf', actionId: 'pay', params: { cost: { wood: 1 } } }
    expect(analyzeFlowInteractivity(f)).toBe('auto')
  })

  it('pay leaf with altCosts is interactive', () => {
    const f: ActionFlow = {
      type: 'leaf', actionId: 'pay',
      params: { altCosts: [{ wood: 1 }, { clay: 1 }] },
    }
    expect(analyzeFlowInteractivity(f)).toBe('interactive')
  })

  it('xor node is always interactive', () => {
    const f: ActionFlow = {
      type: 'xor',
      children: [
        { type: 'leaf', actionId: 'gain', params: { wood: 1 } },
        { type: 'leaf', actionId: 'gain', params: { clay: 1 } },
      ],
    }
    expect(analyzeFlowInteractivity(f)).toBe('interactive')
  })

  it('seq with optional flag is interactive', () => {
    const f: ActionFlow = {
      type: 'seq', optional: true,
      children: [{ type: 'leaf', actionId: 'gain', params: { wood: 1 } }],
    }
    expect(analyzeFlowInteractivity(f)).toBe('interactive')
  })

  it('seq of all auto children is auto', () => {
    const f: ActionFlow = {
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'gain', params: { wood: 1 } },
        { type: 'leaf', actionId: 'gain', params: { clay: 1 } },
      ],
    }
    expect(analyzeFlowInteractivity(f)).toBe('auto')
  })

  it('seq containing one interactive child is interactive', () => {
    const f: ActionFlow = {
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'gain', params: { wood: 1 } },
        { type: 'leaf', actionId: 'pay', params: { altCosts: [{ wood: 1 }, { clay: 1 }] } },
      ],
    }
    expect(analyzeFlowInteractivity(f)).toBe('interactive')
  })

  it('parallel of all auto children is auto', () => {
    const f: ActionFlow = {
      type: 'parallel',
      children: [{ type: 'leaf', actionId: 'gain', params: { wood: 1 } }],
    }
    expect(analyzeFlowInteractivity(f)).toBe('auto')
  })

  it('parallel with interactive child is interactive', () => {
    const f: ActionFlow = {
      type: 'parallel',
      children: [
        { type: 'leaf', actionId: 'gain', params: { wood: 1 } },
        { type: 'xor', children: [
          { type: 'leaf', actionId: 'gain', params: { wood: 1 } },
          { type: 'leaf', actionId: 'gain', params: { clay: 1 } },
        ]},
      ],
    }
    expect(analyzeFlowInteractivity(f)).toBe('interactive')
  })

  it('leaf actionId declaring interaction is interactive', () => {
    const f: ActionFlow = { type: 'leaf', actionId: 'farm-select-plow' }
    expect(analyzeFlowInteractivity(f)).toBe('interactive')
  })
})
