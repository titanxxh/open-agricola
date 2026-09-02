import { describe, expect, it } from 'vitest'
import type { PlayerState } from '../../../contract/types'
import { meetsCardPrerequisites } from '../prerequisites'
import { C070_LettucePatch } from '../../../cards/C/C070_LettucePatch'
import '../../../cards/B/B068_Beanfield'
import '../../../cards/B/B113_PatchCaregiver'
import '../../../cards/B/B141_FieldCaretaker'

type MinimalPlayer = Pick<
  PlayerState,
  | 'occupationPlayed'
  | 'extraOccupationsFromCards'
  | 'fields'
  | 'pastures'
  | 'improvements'
  | 'minorPlayed'
  | 'cardStates'
  | 'roomTiles'
  | 'stableTiles'
  | 'farmTerrain'
  | 'resources'
>

function makePlayer(overrides: Partial<MinimalPlayer> = {}): PlayerState {
  return {
    occupationPlayed: [],
    extraOccupationsFromCards: [],
    fields: [],
    pastures: [],
    improvements: [],
    minorPlayed: [],
    cardStates: {},
    roomTiles: [],
    stableTiles: [],
    farmTerrain: [],
    resources: {},
    ...overrides,
  } as unknown as PlayerState
}

describe('prerequisites: providesField card-provided fields', () => {
  it('a registered Card Field counts toward a field requirement', () => {
    const player = makePlayer({
      fields: [{ crop: null, amount: 0 } as unknown as PlayerState['fields'][0]],
      minorPlayed: ['C070_LettucePatch'],
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

  it('Card Fields do not count as Field Tiles', () => {
    const cardField = { minorPlayed: ['C070_LettucePatch'] }
    expect(meetsCardPrerequisites(makePlayer(cardField), { prerequisite: 'No Field Tiles' })).toBe(true)
    expect(meetsCardPrerequisites(makePlayer({
      ...cardField,
      fields: [
        { row: 0, col: 0, stacks: [] },
        { row: 0, col: 1, stacks: [] },
      ],
    }), { prerequisite: 'Exactly 3 Field Tiles' })).toBe(false)
    expect(meetsCardPrerequisites(makePlayer({
      ...cardField,
      fields: [
        { row: 0, col: 0, stacks: [] },
        { row: 0, col: 1, stacks: [] },
        { row: 0, col: 2, stacks: [] },
      ],
    }), { prerequisite: 'Exactly 3 Field Tiles' })).toBe(true)
  })

  it('supports animal count clauses', () => {
    const player = makePlayer({
      resources: { sheep: 1 },
    })

    expect(meetsCardPrerequisites(player, { prerequisite: '1 Sheep' })).toBe(true)
    expect(meetsCardPrerequisites(player, { prerequisite: '2 Sheep' })).toBe(false)
    expect(meetsCardPrerequisites(player, { prerequisite: 'Exactly 1 Sheep' })).toBe(true)
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
    expect(C070_LettucePatch.providesField).toBe(true)

    const player = makePlayer({
      fields: [{ row: 1, col: 1, crop: null } as unknown as PlayerState['fields'][0]],
      minorPlayed: ['C070_LettucePatch'],
    })
    const card = { prerequisite: '2 Fields' }
    expect(meetsCardPrerequisites(player, card)).toBe(true)
  })
})

describe('prerequisites: Farmers of the Moor text clauses', () => {
  it('counts all improvements for generic improvement prerequisites', () => {
    const player = makePlayer({
      improvements: ['Major_Well'],
      minorPlayed: ['A037_Bucksaw'],
    })

    expect(meetsCardPrerequisites(player, { prerequisite: '2 Improvements' })).toBe(true)
    expect(meetsCardPrerequisites(player, { prerequisite: '3 Improvements' })).toBe(false)
    expect(meetsCardPrerequisites(player, { prerequisite: 'At Most 2 Improvements' })).toBe(true)
    expect(meetsCardPrerequisites(player, { prerequisite: 'At Most 1 Improvement' })).toBe(false)
  })

  it('supports terrain and unused farmyard clauses', () => {
    const fullFarm = makePlayer({
      roomTiles: Array.from({ length: 15 }, (_, index) => ({
        row: Math.floor(index / 5),
        col: index % 5,
      })),
      farmTerrain: [{ row: 0, col: 0, kind: 'moor' }],
    })
    const openFarm = makePlayer({
      roomTiles: [{ row: 0, col: 0 }],
      farmTerrain: [{ row: 1, col: 0, kind: 'forest' }],
    })

    expect(meetsCardPrerequisites(fullFarm, { prerequisite: 'No Unused Farmyard Spaces' })).toBe(true)
    expect(meetsCardPrerequisites(openFarm, { prerequisite: 'No Unused Farmyard Spaces' })).toBe(false)
    expect(meetsCardPrerequisites(fullFarm, { prerequisite: 'At Least 1 Moor' })).toBe(true)
    expect(meetsCardPrerequisites(openFarm, { prerequisite: 'At Least 1 Moor' })).toBe(false)
    expect(meetsCardPrerequisites(openFarm, { prerequisite: 'At Least 1 Forest' })).toBe(true)
  })
})

describe('prerequisites: Card Fields with crops', () => {
  it('ordinary grain fields alone satisfy "2 Grain Fields"', () => {
    const player = makePlayer({
      fields: [
        { row: 1, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] } as unknown as PlayerState['fields'][0],
        { row: 1, col: 2, stacks: [{ kind: 'grain', remaining: 1 }] } as unknown as PlayerState['fields'][0],
      ],
    })

    expect(meetsCardPrerequisites(player, { prerequisite: '2 Grain Fields' })).toBe(true)
  })

  it('Card Field grain stacks alone satisfy "2 Grain Fields"', () => {
    const player = makePlayer({
      occupationPlayed: ['B113_PatchCaregiver', 'B141_FieldCaretaker'],
      cardStates: {
        B113_PatchCaregiver: { extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 1 }] } },
        B141_FieldCaretaker: { extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 1 }] } },
      },
    })

    expect(meetsCardPrerequisites(player, { prerequisite: '2 Grain Fields' })).toBe(true)
  })

  it('ordinary grain field plus Card Field grain stack satisfies "2 Grain Fields"', () => {
    const player = makePlayer({
      fields: [{ row: 1, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] } as unknown as PlayerState['fields'][0]],
      occupationPlayed: ['B113_PatchCaregiver'],
      cardStates: {
        B113_PatchCaregiver: { extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 1 }] } },
      },
    })

    expect(meetsCardPrerequisites(player, { prerequisite: '2 Grain Fields' })).toBe(true)
  })

  it('combined count below two does not satisfy "2 Grain Fields"', () => {
    const player = makePlayer({
      fields: [{ row: 1, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] } as unknown as PlayerState['fields'][0]],
    })

    expect(meetsCardPrerequisites(player, { prerequisite: '2 Grain Fields' })).toBe(false)
  })

  it('non-grain Card Fields do not count toward "2 Grain Fields"', () => {
    const player = makePlayer({
      fields: [{ row: 1, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] } as unknown as PlayerState['fields'][0]],
      minorPlayed: ['B068_Beanfield'],
      cardStates: {
        B068_Beanfield: { extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: 1 }] } },
      },
    })

    expect(meetsCardPrerequisites(player, { prerequisite: '2 Grain Fields' })).toBe(false)
  })

  it('other players card fields are not part of this player prerequisite count', () => {
    const player = makePlayer({
      fields: [{ row: 1, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] } as unknown as PlayerState['fields'][0]],
    })
    const opponent = makePlayer({
      occupationPlayed: ['B113_PatchCaregiver', 'B141_FieldCaretaker'],
      cardStates: {
        B113_PatchCaregiver: { extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 1 }] } },
        B141_FieldCaretaker: { extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 1 }] } },
      },
    })

    expect(meetsCardPrerequisites(player, { prerequisite: '2 Grain Fields' })).toBe(false)
    expect(meetsCardPrerequisites(opponent, { prerequisite: '2 Grain Fields' })).toBe(true)
  })
})
