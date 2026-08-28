import { describe, it, expect } from 'vitest'
import { sowCrop, getEmptyFields, canSow, isUnconditionalSow, sowAction } from '../sow'
import { makeBlankPlayer } from '../../../domain/__tests__/helpers'
import type { Field, GameState, PlayerState } from '../../../contract/types'

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

describe('isUnconditionalSow', () => {
  it('ignores replacement bookkeeping but rejects selection restrictions', () => {
    expect(isUnconditionalSow()).toBe(true)
    expect(isUnconditionalSow({ checkedReplaceAction: true })).toBe(true)
    expect(isUnconditionalSow({ maxSelections: 1 })).toBe(false)
    expect(isUnconditionalSow({ cropType: 'grain' })).toBe(false)
  })
})

const STATE_STUB = {} as unknown as GameState

describe('sowAction.canBeExecutedByPlayer', () => {
  it('returns false when cropType="grain" and player has only vegetable', () => {
    const player = makeBlankPlayer({
      resources: { grain: 0, vegetable: 3 },
      fields: [{ row: 0, col: 0, stacks: [] }],
    }) as unknown as PlayerState
    const doable = sowAction.canBeExecutedByPlayer!(STATE_STUB, player, {
      actionContext: { cropType: 'grain', maxSelections: 1 },
    })
    expect(doable).toBe(false)
  })

  it('returns true when cropType="grain" and player has grain + empty field', () => {
    const player = makeBlankPlayer({
      resources: { grain: 1, vegetable: 0 },
      fields: [{ row: 0, col: 0, stacks: [] }],
    }) as unknown as PlayerState
    expect(
      sowAction.canBeExecutedByPlayer!(STATE_STUB, player, {
        actionContext: { cropType: 'grain', maxSelections: 1 },
      }),
    ).toBe(true)
  })

  it('returns false when cropType="wood" and no extra-field card is in play', () => {
    const player = makeBlankPlayer({
      resources: { wood: 5 },
      fields: [{ row: 0, col: 0, stacks: [] }],
    }) as unknown as PlayerState
    expect(
      sowAction.canBeExecutedByPlayer!(STATE_STUB, player, {
        actionContext: { cropType: 'wood' },
      }),
    ).toBe(false)
  })
})
