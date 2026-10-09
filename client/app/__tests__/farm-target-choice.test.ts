import { describe, expect, it } from 'vitest'
import type { ActionChoiceOption } from '../../../shared/contract/types'
import { buildFarmTargetChoiceBindings, getFarmTargetChoices } from '../farm-target-choice'

describe('authoritative farm choice bindings', () => {
  const option = (value: string, playerId = 'p1'): ActionChoiceOption => ({
    value, label: value, target: { kind: 'farm-cell', playerId, positions: [{ row: 0, col: 2 }] },
  })

  it('binds only enabled choices for the displayed owner and preserves opaque values', () => {
    const bindings = buildFarmTargetChoiceBindings([option('opaque'), option('other', 'p2'), { ...option('disabled'), disabled: true }], 'p1')
    expect(getFarmTargetChoices(bindings, { row: 0, col: 2 }).map((item) => item.value)).toEqual(['opaque'])
    expect(getFarmTargetChoices(bindings, { row: 0, col: 1 })).toEqual([])
  })

  it('keeps multiple choices on one cell for explicit selection', () => {
    const bindings = buildFarmTargetChoiceBindings([option('first'), option('second')], 'p1')
    expect(getFarmTargetChoices(bindings, { row: 0, col: 2 }).map((item) => item.value)).toEqual(['first', 'second'])
  })

  it('binds every occupied slot of one Card Field to the same logical choice', () => {
    const choice: ActionChoiceOption = { value: 'whole-field', label: '', target: {
      kind: 'logical-field', fieldId: 'card:test', playerId: 'p1', resources: { wood: 5 },
      positions: [{ row: -1, col: 1, sourceCard: 'test', cardFieldSlot: 0 }, { row: -1, col: 2, sourceCard: 'test', cardFieldSlot: 1 }],
    } }
    const bindings = buildFarmTargetChoiceBindings([choice], 'p1')
    expect(getFarmTargetChoices(bindings, { row: -1, col: 1 })).toEqual([choice])
    expect(getFarmTargetChoices(bindings, { row: -1, col: 2 })).toEqual([choice])
  })
})
