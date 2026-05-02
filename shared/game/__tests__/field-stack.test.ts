import { describe, it, expect } from 'vitest'
import type { Field, CropStack } from '../types'
import {
  fieldIsEmpty,
  fieldTopStack,
  fieldBottomStack,
  fieldHasCrop,
  fieldTotalRemaining,
  fieldPopIfDepleted,
  fieldDecrementTop,
  fieldFindStackOfKind,
  countFieldsWithCrop,
  countEmptyFields,
} from '../field'
describe('Field stack type', () => {
  it('accepts a field with empty stacks', () => {
    const f: Field = { stacks: [], row: 0, col: 0 }
    expect(f.stacks.length).toBe(0)
  })

  it('accepts a field with grain stack', () => {
    const stack: CropStack = { kind: 'grain', remaining: 3 }
    const f: Field = { stacks: [stack], row: 0, col: 0 }
    expect(f.stacks[0].kind).toBe('grain')
  })

  it('accepts a field with veg bottom + grain top', () => {
    const f: Field = {
      stacks: [
        { kind: 'vegetable', remaining: 1 },
        { kind: 'grain', remaining: 3 },
      ],
      row: 0,
      col: 0,
    }
    expect(f.stacks[0].kind).toBe('vegetable')
    expect(f.stacks[f.stacks.length - 1].kind).toBe('grain')
  })
})

describe('field helpers', () => {
  it('fieldIsEmpty true when stacks empty', () => {
    expect(fieldIsEmpty({ stacks: [], row: 0, col: 0 })).toBe(true)
  })

  it('fieldIsEmpty false when stacks non-empty', () => {
    expect(
      fieldIsEmpty({
        stacks: [{ kind: 'grain', remaining: 1 }],
        row: 0,
        col: 0,
      }),
    ).toBe(false)
  })

  it('fieldTopStack returns last element', () => {
    const f: Field = {
      stacks: [
        { kind: 'vegetable', remaining: 1 },
        { kind: 'grain', remaining: 3 },
      ],
      row: 0,
      col: 0,
    }
    expect(fieldTopStack(f)?.kind).toBe('grain')
  })

  it('fieldBottomStack returns first element', () => {
    const f: Field = {
      stacks: [
        { kind: 'vegetable', remaining: 1 },
        { kind: 'grain', remaining: 3 },
      ],
      row: 0,
      col: 0,
    }
    expect(fieldBottomStack(f)?.kind).toBe('vegetable')
  })

  it('fieldHasCrop detects any stack', () => {
    const f: Field = {
      stacks: [
        { kind: 'vegetable', remaining: 1 },
        { kind: 'grain', remaining: 3 },
      ],
      row: 0,
      col: 0,
    }
    expect(fieldHasCrop(f, 'grain')).toBe(true)
    expect(fieldHasCrop(f, 'vegetable')).toBe(true)
  })

  it('fieldTotalRemaining sums across stacks', () => {
    const f: Field = {
      stacks: [
        { kind: 'vegetable', remaining: 1 },
        { kind: 'grain', remaining: 3 },
      ],
      row: 0,
      col: 0,
    }
    expect(fieldTotalRemaining(f)).toBe(4)
  })

  it('fieldDecrementTop decrements top and pops when depleted', () => {
    const f: Field = {
      stacks: [
        { kind: 'vegetable', remaining: 1 },
        { kind: 'grain', remaining: 1 },
      ],
      row: 0,
      col: 0,
    }
    fieldDecrementTop(f)
    expect(f.stacks.length).toBe(1)
    expect(f.stacks[0].kind).toBe('vegetable')
  })

  it('fieldPopIfDepleted removes depleted top stacks', () => {
    const f: Field = {
      stacks: [
        { kind: 'vegetable', remaining: 1 },
        { kind: 'grain', remaining: 0 },
      ],
      row: 0,
      col: 0,
    }
    fieldPopIfDepleted(f)
    expect(f.stacks.length).toBe(1)
    expect(f.stacks[0].kind).toBe('vegetable')
  })

  it('fieldFindStackOfKind returns matching stack', () => {
    const f: Field = {
      stacks: [
        { kind: 'vegetable', remaining: 1 },
        { kind: 'grain', remaining: 3 },
      ],
      row: 0,
      col: 0,
    }
    expect(fieldFindStackOfKind(f, 'grain')?.remaining).toBe(3)
    expect(fieldFindStackOfKind(f, 'vegetable')?.remaining).toBe(1)
  })

  it('countFieldsWithCrop counts across array', () => {
    const fields: Field[] = [
      { stacks: [{ kind: 'grain', remaining: 1 }], row: 0, col: 0 },
      { stacks: [], row: 0, col: 1 },
      {
        stacks: [
          { kind: 'vegetable', remaining: 1 },
          { kind: 'grain', remaining: 1 },
        ],
        row: 0,
        col: 2,
      },
    ]
    expect(countFieldsWithCrop(fields, 'grain')).toBe(2)
    expect(countFieldsWithCrop(fields, 'vegetable')).toBe(1)
  })

  it('countEmptyFields counts empty-stack fields', () => {
    const fields: Field[] = [
      { stacks: [], row: 0, col: 0 },
      { stacks: [{ kind: 'grain', remaining: 1 }], row: 0, col: 1 },
      { stacks: [], row: 0, col: 2 },
    ]
    expect(countEmptyFields(fields)).toBe(2)
  })
})

