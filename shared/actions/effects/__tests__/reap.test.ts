import { describe, it, expect, vi, afterEach } from 'vitest'
import { reap } from '../reap'
import * as cardListeners from '../../../cards/card-listeners'

const mkState = (): any => ({ players: [] })

const mkPlayer = (fields: any[]): any => ({
  fields,
  resources: { grain: 0, vegetable: 0 },
})

describe('reap with stacks', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('harvests top stack only, decrements remaining', () => {
    vi.spyOn(cardListeners, 'runCardListeners').mockImplementation(() => {})
    const p = mkPlayer([
      { stacks: [{ kind: 'grain', remaining: 3 }], row: 0, col: 0 },
    ])
    const res = reap(mkState(), p)
    expect(res.type).toBe('ok')
    expect(p.resources.grain).toBe(1)
    expect(p.fields[0].stacks).toEqual([{ kind: 'grain', remaining: 2 }])
    expect(res.reapSummary.grainFields).toBe(1)
    expect(res.reapSummary.resources.grain).toBe(1)
  })

  it('pops empty top stack, exposes buried stack next round', () => {
    vi.spyOn(cardListeners, 'runCardListeners').mockImplementation(() => {})
    const p = mkPlayer([
      {
        stacks: [
          { kind: 'vegetable', remaining: 1 },
          { kind: 'grain', remaining: 1 },
        ],
        row: 0,
        col: 0,
      },
    ])
    reap(mkState(), p)
    expect(p.resources.grain).toBe(1)
    expect(p.fields[0].stacks).toEqual([{ kind: 'vegetable', remaining: 1 }])
    reap(mkState(), p)
    expect(p.resources.vegetable).toBe(1)
    expect(p.fields[0].stacks).toEqual([])
  })

  it('skips empty fields', () => {
    vi.spyOn(cardListeners, 'runCardListeners').mockImplementation(() => {})
    const p = mkPlayer([{ stacks: [], row: 0, col: 0 }])
    const res = reap(mkState(), p)
    expect(res.reapSummary.grainFields).toBe(0)
    expect(res.reapSummary.vegetableFields).toBe(0)
  })

  it('summary counts fields by TOP stack kind', () => {
    vi.spyOn(cardListeners, 'runCardListeners').mockImplementation(() => {})
    const p = mkPlayer([
      {
        stacks: [
          { kind: 'vegetable', remaining: 1 },
          { kind: 'grain', remaining: 2 },
        ],
        row: 0,
        col: 0,
      },
      {
        stacks: [{ kind: 'vegetable', remaining: 1 }],
        row: 0,
        col: 1,
      },
    ])
    const res = reap(mkState(), p)
    expect(res.reapSummary.grainFields).toBe(1)
    expect(res.reapSummary.vegetableFields).toBe(1)
  })
})
