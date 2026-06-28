import { describe, it, expect } from 'vitest'
import { validateSowSelection } from '../farmyard'
import { makeBlankPlayer } from './helpers'

describe('validateSowSelection generic crop validation', () => {
  it('rejects crop="stone" on normal field by default', () => {
    const player = makeBlankPlayer({
      resources: { stone: 5 },
      fields: [{ row: 0, col: 0, stacks: [] }],
    })
    const res = validateSowSelection(player, [{ row: 0, col: 0, crop: 'stone' }])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('INVALID_CROP')
  })

  it('rejects crop="wood" on normal field by default', () => {
    const player = makeBlankPlayer({
      resources: { wood: 5 },
      fields: [{ row: 0, col: 0, stacks: [] }],
    })
    const res = validateSowSelection(player, [{ row: 0, col: 0, crop: 'wood' }])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('INVALID_CROP')
  })

  it('respects normalFieldAllowedCrops:["grain"] — vegetable rejected', () => {
    const player = makeBlankPlayer({
      resources: { grain: 2, vegetable: 2 },
      fields: [
        { row: 0, col: 0, stacks: [] },
        { row: 0, col: 1, stacks: [] },
      ],
    })
    const vegRes = validateSowSelection(
      player,
      [{ row: 0, col: 0, crop: 'vegetable' }],
      { normalFieldAllowedCrops: ['grain'] },
    )
    expect(vegRes.ok).toBe(false)
    const grainRes = validateSowSelection(
      player,
      [{ row: 0, col: 1, crop: 'grain' }],
      { normalFieldAllowedCrops: ['grain'] },
    )
    expect(grainRes.ok).toBe(true)
  })
})

describe('validateSowSelection maxSelections by logical group', () => {
  it('allows 2 same-group extra slots when maxSelections=1', () => {
    const player = makeBlankPlayer({ resources: { wood: 2 } })
    const res = validateSowSelection(
      player,
      [
        { row: -75, col: 0, crop: 'wood' },
        { row: -75, col: 1, crop: 'wood' },
      ],
      {
        maxSelections: 1,
        extraAllowedCrops: new Map([
          ['-75-0', ['wood']],
          ['-75-1', ['wood']],
        ]),
        extraGroupKeys: new Map([
          ['-75-0', 'D075_WoodField'],
          ['-75-1', 'D075_WoodField'],
        ]),
      },
    )
    expect(res.ok).toBe(true)
  })

  it('rejects mix of 1 normal + 1 extra-slot when maxSelections=1', () => {
    const player = makeBlankPlayer({
      resources: { grain: 1, wood: 1 },
      fields: [{ row: 0, col: 0, stacks: [] }],
    })
    const res = validateSowSelection(
      player,
      [
        { row: 0, col: 0, crop: 'grain' },
        { row: -75, col: 0, crop: 'wood' },
      ],
      {
        maxSelections: 1,
        extraAllowedCrops: new Map([['-75-0', ['wood']]]),
        extraGroupKeys: new Map([['-75-0', 'D075_WoodField']]),
      },
    )
    expect(res.ok).toBe(false)
  })

  it('rejects 2 different normal fields when maxSelections=1 (pre-existing behavior)', () => {
    const player = makeBlankPlayer({
      resources: { grain: 2 },
      fields: [
        { row: 0, col: 0, stacks: [] },
        { row: 0, col: 1, stacks: [] },
      ],
    })
    const res = validateSowSelection(
      player,
      [
        { row: 0, col: 0, crop: 'grain' },
        { row: 0, col: 1, crop: 'grain' },
      ],
      { maxSelections: 1 },
    )
    expect(res.ok).toBe(false)
  })
})
