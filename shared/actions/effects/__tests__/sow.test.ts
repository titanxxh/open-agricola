import { describe, it, expect } from 'vitest'
import { sowCrop, getEmptyFields, canSow } from '../sow'
import type { Field, PlayerState } from '../../../game/types'

const mkPlayer = (fields: Field[], grain = 0, veg = 0): Partial<PlayerState> => ({
  fields,
  resources: { grain, vegetable: veg },
})

describe('sowCrop with stacks', () => {
  it('sows grain into empty field → stack[0] grain remaining=3', () => {
    const player = mkPlayer([{ stacks: [], row: 0, col: 0 }], 1, 0)
    const res = sowCrop(player, 'grain')
    expect(res.type).toBe('ok')
    expect(player.fields[0].stacks).toEqual([{ kind: 'grain', remaining: 3 }])
    expect(player.resources.grain).toBe(0)
  })

  it('sows vegetable → remaining=2', () => {
    const player = mkPlayer([{ stacks: [], row: 0, col: 0 }], 0, 1)
    sowCrop(player, 'vegetable')
    expect(player.fields[0].stacks).toEqual([{ kind: 'vegetable', remaining: 2 }])
  })

  it('rejects sow on non-empty field', () => {
    const player = mkPlayer(
      [{ stacks: [{ kind: 'grain', remaining: 1 }], row: 0, col: 0 }],
      1,
      0,
    )
    const res = sowCrop(player, 'grain')
    expect(res.type).toBe('fail')
  })

  it('getEmptyFields returns only empty-stack fields', () => {
    const player = mkPlayer([
      { stacks: [], row: 0, col: 0 },
      { stacks: [{ kind: 'grain', remaining: 1 }], row: 0, col: 1 },
    ])
    expect(getEmptyFields(player)).toHaveLength(1)
  })

  it('canSow false when no empty field', () => {
    const player = mkPlayer(
      [{ stacks: [{ kind: 'grain', remaining: 1 }], row: 0, col: 0 }],
      1,
      0,
    )
    expect(canSow(player)).toBe(false)
  })
})
