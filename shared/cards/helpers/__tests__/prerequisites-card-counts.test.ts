import { describe, expect, it } from 'vitest'
import type { PlayerState } from '../../../contract/types'
import { meetsCardPrerequisites } from '../prerequisites'
import { MinorImprovement } from '../../../cards-display/types'
import { registerAdHocMinorImprovement } from '../../registry-runtime'
import { C70_LettucePatch } from '../../../cards-display/C/C70_LettucePatch'

// Register a throwaway field-providing minor for this test file only
registerAdHocMinorImprovement(
  new MinorImprovement({
    id: 'TEST_FieldProvider',
    name: 'Test Field Provider',
    deck: 'X',
    number: 999,
    desc: [],
    providesField: true,
  }),
)

// Register a plain minor without providesField for regression check
registerAdHocMinorImprovement(
  new MinorImprovement({
    id: 'TEST_PlainMinor',
    name: 'Test Plain Minor',
    deck: 'X',
    number: 998,
    desc: [],
  }),
)

type MinimalPlayer = Pick<
  PlayerState,
  'occupationPlayed' | 'extraOccupationsFromCards' | 'fields' | 'pastures' | 'improvements' | 'minorPlayed'
>

function makePlayer(overrides: Partial<MinimalPlayer> = {}): PlayerState {
  return {
    occupationPlayed: [],
    extraOccupationsFromCards: [],
    fields: [],
    pastures: [],
    improvements: [],
    minorPlayed: [],
    ...overrides,
  } as unknown as PlayerState
}

describe('prerequisites: providesField card-provided fields', () => {
  it('TEST_FieldProvider in minorPlayed counts toward field requirement (1 real + 1 card = 2)', () => {
    const player = makePlayer({
      fields: [{ crop: null, amount: 0 } as unknown as PlayerState['fields'][0]],
      minorPlayed: ['TEST_FieldProvider'],
    })
    const card = { prerequisite: '2 Fields' }
    expect(meetsCardPrerequisites(player, card)).toBe(true)
  })

  it('2 real fields already satisfy "2 Fields" prerequisite (regression)', () => {
    const player = makePlayer({
      fields: [
        { crop: null, amount: 0 } as unknown as PlayerState['fields'][0],
        { crop: null, amount: 0 } as unknown as PlayerState['fields'][0],
      ],
      minorPlayed: [],
    })
    const card = { prerequisite: '2 Fields' }
    expect(meetsCardPrerequisites(player, card)).toBe(true)
  })

  it('plain minor without providesField does NOT count toward field prerequisite', () => {
    const player = makePlayer({
      fields: [],
      minorPlayed: ['TEST_PlainMinor'],
    })
    const card = { prerequisite: '1 Fields' }
    expect(meetsCardPrerequisites(player, card)).toBe(false)
  })
})

describe('prerequisites: extraOccupationsFromCards counts toward occupations', () => {
  it('extraOccupationsFromCards adds to occupation count for numeric prerequisite', () => {
    const player = makePlayer({
      occupationPlayed: ['OCC1', 'OCC2'],
      extraOccupationsFromCards: ['CARD_OCC1'],
    })
    const card = { prerequisite: '3 Occupations' }
    expect(meetsCardPrerequisites(player, card)).toBe(true)
  })

  it('"No Occupations" fails when extraOccupationsFromCards is non-empty', () => {
    const player = makePlayer({
      occupationPlayed: [],
      extraOccupationsFromCards: ['CARD_OCC1'],
    })
    const card = { prerequisite: 'No Occupations' }
    expect(meetsCardPrerequisites(player, card)).toBe(false)
  })

  it('occupationPrerequisites max:0 fails when extraOccupationsFromCards has 1 entry', () => {
    const player = makePlayer({
      occupationPlayed: [],
      extraOccupationsFromCards: ['CARD_OCC1'],
    })
    const card = { occupationPrerequisites: { max: 0 } }
    expect(meetsCardPrerequisites(player, card)).toBe(false)
  })
})

describe('C70 Lettuce Patch as providesField', () => {
  it('C70 counts as a field for "2 Fields" prerequisite', () => {
    // Ensure card is registered
    expect(C70_LettucePatch.providesField).toBe(true)

    const player = makePlayer({
      fields: [{ row: 1, col: 1, crop: null } as unknown as PlayerState['fields'][0]],
      minorPlayed: ['C70_LettucePatch'],
    })
    const card = { prerequisite: '2 Fields' }
    expect(meetsCardPrerequisites(player, card)).toBe(true)
  })
})
