import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { CardRegistry } from '../../registry'
import { setActiveCardRegistry, getActiveCardRegistry } from '../../active-registry'
import { meetsCardPrerequisites } from '../prerequisites'
import type { PlayerState, GameState } from '../../../contract/types'

const buildPlayer = (overrides: Partial<PlayerState> = {}): PlayerState =>
  ({
    occupationPlayed: [],
    extraOccupationsFromCards: [],
    improvements: [],
    minorPlayed: [],
    fields: [],
    pastures: [],
    resources: { food: 0, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 },
    rooms: 1,
    houseType: 'wood',
    ...overrides,
  } as unknown as PlayerState)

const buildState = (round = 1): GameState => ({ round, players: [] } as unknown as GameState)

describe('meetsCardPrerequisites inline routing', () => {
  let prevRegistry: CardRegistry | null

  beforeEach(() => {
    prevRegistry = getActiveCardRegistry()
    setActiveCardRegistry(new CardRegistry())
  })

  afterEach(() => {
    setActiveCardRegistry(prevRegistry)
  })

  it('uses inline prerequisiteCheck when registered', () => {
    const reg = getActiveCardRegistry()!
    reg.loadImpl('X1_Test', { prerequisiteCheck: () => false })
    const card = { id: 'X1_Test', prerequisite: 'whatever' }
    expect(meetsCardPrerequisites(buildPlayer(), card, 1, buildState(1))).toBe(false)
  })

  it('inline check overrides built-in declarative parser', () => {
    const reg = getActiveCardRegistry()!
    // 'No Occupations' is recognized by the declarative parser → would return true
    // for empty occupationPlayed; inline check returns false → inline wins.
    reg.loadImpl('X1_Test', { prerequisiteCheck: () => false })
    const card = { id: 'X1_Test', prerequisite: 'No Occupations' }
    expect(meetsCardPrerequisites(buildPlayer(), card, 1, buildState(1))).toBe(false)
  })

  it('falls back to declarative parser when no inline check', () => {
    const card = { id: 'X1_Test', prerequisite: 'No Occupations' }
    expect(meetsCardPrerequisites(buildPlayer(), card, 1, buildState(1))).toBe(true)
  })

  it('falls back to declarative parser when active registry is null', () => {
    setActiveCardRegistry(null)
    const card = { id: 'X1_Test', prerequisite: 'No Occupations' }
    expect(meetsCardPrerequisites(buildPlayer(), card, 1, buildState(1))).toBe(true)
  })
})
