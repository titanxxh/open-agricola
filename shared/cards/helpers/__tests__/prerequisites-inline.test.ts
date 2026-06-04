import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { CardRegistry } from '../../registry'
import { setActiveCardRegistry, getActiveCardRegistry } from '../../active-registry'
import { meetsCardPrerequisites } from '../prerequisites'
import type { PlayerState, GameState } from '../../../contract/types'
import { B52_GrowingFarm } from '../../../cards/B/B52_GrowingFarm'
import { C32_AbortOriel } from '../../../cards/C/C32_AbortOriel'
import { D37_Sculpture } from '../../../cards/D/D37_Sculpture'
import { D25_WitchesDanceFloor } from '../../../cards/D/D25_WitchesDanceFloor'
import { B52_GrowingFarm_impl } from '../../B/B52_GrowingFarm'
import { C32_AbortOriel_impl } from '../../C/C32_AbortOriel'
import { D37_Sculpture_impl } from '../../D/D37_Sculpture'
import { A52_ThrowingAxe } from '../../../cards/A/A52_ThrowingAxe'
import { B51_DiggingSpade } from '../../../cards/B/B51_DiggingSpade'
import { A52_ThrowingAxe_impl } from '../../A/A52_ThrowingAxe'
import { B51_DiggingSpade_impl } from '../../B/B51_DiggingSpade'

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

describe("prereq 'see below' coexistence", () => {
  let prevRegistry: CardRegistry | null

  beforeEach(() => {
    prevRegistry = getActiveCardRegistry()
    const reg = new CardRegistry()
    reg.loadImpl(B52_GrowingFarm.id, B52_GrowingFarm_impl)
    reg.loadImpl(C32_AbortOriel.id, C32_AbortOriel_impl)
    reg.loadImpl(D37_Sculpture.id, D37_Sculpture_impl)
    setActiveCardRegistry(reg)
  })

  afterEach(() => {
    setActiveCardRegistry(prevRegistry)
  })

  it('all four share prerequisite="see below" without collision', () => {
    expect(B52_GrowingFarm.prerequisite).toBe('see below')
    expect(C32_AbortOriel.prerequisite).toBe('see below')
    expect(D37_Sculpture.prerequisite).toBe('see below')
    expect(D25_WitchesDanceFloor.prerequisite).toBe('see below')
  })

  it('D25 (no inline check) falls back to declarative parser → fail-open', () => {
    // 'see below' has no built-in regex match → returns true (fail-open).
    expect(meetsCardPrerequisites(buildPlayer(), D25_WitchesDanceFloor, 1, buildState(1))).toBe(true)
  })

  it('B52 inline check rejects when coveredZones < round-1', () => {
    const player = buildPlayer({ pastures: [] })
    expect(meetsCardPrerequisites(player, B52_GrowingFarm, 5, buildState(5))).toBe(false)
  })
})

describe("A52 / B51 'Play in Round 7 or Later' independence", () => {
  let prevRegistry: CardRegistry | null

  beforeEach(() => {
    prevRegistry = getActiveCardRegistry()
    const reg = new CardRegistry()
    reg.loadImpl(A52_ThrowingAxe.id, A52_ThrowingAxe_impl)
    reg.loadImpl(B51_DiggingSpade.id, B51_DiggingSpade_impl)
    setActiveCardRegistry(reg)
  })

  afterEach(() => {
    setActiveCardRegistry(prevRegistry)
  })

  it('both reject at round 6', () => {
    expect(meetsCardPrerequisites(buildPlayer(), A52_ThrowingAxe, 6, buildState(6))).toBe(false)
    expect(meetsCardPrerequisites(buildPlayer(), B51_DiggingSpade, 6, buildState(6))).toBe(false)
  })

  it('both accept at round 7', () => {
    expect(meetsCardPrerequisites(buildPlayer(), A52_ThrowingAxe, 7, buildState(7))).toBe(true)
    expect(meetsCardPrerequisites(buildPlayer(), B51_DiggingSpade, 7, buildState(7))).toBe(true)
  })
})
