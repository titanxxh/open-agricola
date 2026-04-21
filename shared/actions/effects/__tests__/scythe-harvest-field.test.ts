import { describe, it, expect } from 'vitest'
import { scytheHarvestFieldAction } from '../scythe-harvest-field'
import type { Field, PlayerState } from '../../../game/types'
import type { ActionExecutionContext } from '../../../game/types'

const mkPlayer = (fields: Field[]): Partial<PlayerState> => ({
  fields,
  resources: { grain: 0, vegetable: 0 },
})

const invoke = (player: Partial<PlayerState>, fieldIndex: number) =>
  scytheHarvestFieldAction.execute({
    player,
    params: { fieldIndex },
    state: {} as unknown as ActionExecutionContext,
    sourceCard: 'E73_Scythe',
  } as unknown as ActionExecutionContext)

describe('scytheHarvestField', () => {
  it('harvests entire top stack at once, leaves buried stack untouched', () => {
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
    const res = invoke(p, 0)
    expect(res.type).toBe('ok')
    expect(p.resources.grain).toBe(3)
    expect(p.fields[0].stacks).toEqual([{ kind: 'vegetable', remaining: 1 }])
  })

  it('single-stack field: stack is popped entirely', () => {
    const p = mkPlayer([
      { stacks: [{ kind: 'grain', remaining: 2 }], row: 0, col: 0 },
    ])
    invoke(p, 0)
    expect(p.resources.grain).toBe(2)
    expect(p.fields[0].stacks).toEqual([])
  })

  it('empty field is rejected', () => {
    const p = mkPlayer([{ stacks: [], row: 0, col: 0 }])
    const res = invoke(p, 0)
    expect(res.type).toBe('fail')
    expect(p.resources.grain).toBe(0)
  })
})
