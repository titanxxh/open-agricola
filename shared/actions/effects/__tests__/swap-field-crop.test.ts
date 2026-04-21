import { describe, it, expect } from 'vitest'
import { swapFieldGrainToVegAction } from '../swap-field-crop'
import type { Field, PlayerState } from '../../../game/types'
import type { ActionExecutionContext } from '../../../game/types'

const mkPlayer = (fields: Field[]): Partial<PlayerState> => ({ fields, resources: {} as PlayerState['resources'] })

const invoke = (player: Partial<PlayerState>, row: number, col: number) =>
  swapFieldGrainToVegAction.execute({
    player,
    params: { row, col },
    state: {} as unknown as ActionExecutionContext,
    sourceCard: 'C69_LandConsolidation',
  } as unknown as ActionExecutionContext)

describe('swapFieldGrainToVeg', () => {
  it('single grain stack remaining=3 becomes vegetable remaining=1', () => {
    const p = mkPlayer([
      { stacks: [{ kind: 'grain', remaining: 3 }], row: 0, col: 0 },
    ])
    const res = invoke(p, 0, 0)
    expect(res.type).toBe('ok')
    expect(p.fields[0].stacks).toEqual([{ kind: 'vegetable', remaining: 1 }])
  })

  it('rejects empty field', () => {
    const p = mkPlayer([{ stacks: [], row: 0, col: 0 }])
    const res = invoke(p, 0, 0)
    expect(res.type).toBe('fail')
  })

  it('rejects multi-stack field (buried veg under grain)', () => {
    const p = mkPlayer([
      {
        stacks: [
          { kind: 'vegetable', remaining: 1 },
          { kind: 'grain', remaining: 3 },
        ],
        row: 0,
        col: 0,
      },
    ])
    const res = invoke(p, 0, 0)
    expect(res.type).toBe('fail')
    expect(p.fields[0].stacks.length).toBe(2)
  })

  it('rejects grain stack with remaining != 3', () => {
    const p = mkPlayer([
      { stacks: [{ kind: 'grain', remaining: 2 }], row: 0, col: 0 },
    ])
    const res = invoke(p, 0, 0)
    expect(res.type).toBe('fail')
  })

  it('rejects vegetable field', () => {
    const p = mkPlayer([
      { stacks: [{ kind: 'vegetable', remaining: 2 }], row: 0, col: 0 },
    ])
    const res = invoke(p, 0, 0)
    expect(res.type).toBe('fail')
  })
})
