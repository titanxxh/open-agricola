/**
 * D25 WitchesDanceFloor — scoring integration tests
 *
 * Key findings documented here:
 *
 * 1. scoring.ts has NO dedicated occupation-quantity tier (no scoreByRanges call
 *    over occupation count). Occupations are iterated per-card at lines 290-292
 *    and each pushes score: 0. There is no "0 occ = -1, 1-2 = 0, 3+ = +VP"
 *    tiered block for occupation count in scoring.ts.
 *
 * 2. D25 is stored in player.minorPlayed (NOT occupationPlayed), so the
 *    per-card scan at line 290 never sees it — no double-counting risk.
 *
 * 3. The countOccupations() helper in shared/cards/helpers/prerequisites.ts
 *    already includes extraOccupationsFromCards (updated in Task 3), so any
 *    card that gates on occupation count gets the correct total. Scoring itself
 *    does not call countOccupations() directly.
 *
 * 4. field scoring uses player.fields.length directly — D25 never mutates
 *    player.fields — so field scoring is unaffected.
 *
 * Conclusion: No change to scoring.ts is required for D25. The "occupation
 * quantity tier" does not exist in this codebase; occupation VP comes entirely
 * from per-card VP values (all 0 for base-game occupations/minors without
 * explicit VP hooks).
 */
import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState, Resource } from '../../game/types'
import { computeScores } from '../scoring'
import '../../cards/D/D25_WitchesDanceFloor'

const emptyResources = (): Resource => ({
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
})

const createPlayer = (): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: emptyResources(),
  rooms: 2,
  houseType: 'wood',
  fields: [],
  fences: 0,
  roomTiles: [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
  ],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],
  playedCards: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  extraOccupationsFromCards: [],
})

const createState = (player: PlayerState): GameState => ({
  round: 1,
  currentPlayerIndex: 0,
  players: [player],
  actionSpaces: [],
  log: [],
  roundStartSnapshot: null,
  roundActionOrder: Array.from({ length: 14 }).map(() => null),
  gameSeed: 1,
  availableMajorImprovements: [],
  futureMeeples: [],
  pendingFutureMeeples: [],
  gameOver: false,
})

describe('D25 scoring', () => {
  it('extraOccupationsFromCards does NOT affect the cards category total (no occupation-quantity tier exists)', () => {
    // scoring.ts has no scoreByRanges occupation-count tier.
    // Occupation VP is 0 per card. extraOccupationsFromCards adds no entries
    // to the per-card scan (D25 sits in minorPlayed, not occupationPlayed).
    const player = createPlayer()
    player.occupationPlayed.push('A1_FieldWatcher', 'A2_Cottager') // 2 real occupations
    player.minorPlayed.push('D25_WitchesDanceFloor')
    player.extraOccupationsFromCards.push('D25_WitchesDanceFloor') // 3 total

    const [result] = computeScores(createState(player))!
    const byKey = new Map(result!.categories.map((c) => [c.key, c]))

    // 'cards' category: 2 occupation entries (score 0 each) + 1 minor entry (score 0)
    // D25 contributes exactly once via the minor scan, NOT via extraOccupationsFromCards
    const cardEntries = byKey.get('cards')?.entries ?? []
    const occupationEntries = cardEntries.filter(
      (e) => e.type === 'card' && e.cardType === 'occupation',
    )
    const minorEntries = cardEntries.filter(
      (e) => e.type === 'card' && e.cardType === 'minor',
    )

    expect(occupationEntries).toHaveLength(2) // only real occupations
    expect(minorEntries).toHaveLength(1) // D25 via minor scan

    // Total cards VP remains 0 (no scoring hook on these cards)
    expect(byKey.get('cards')?.total).toBe(0)
  })

  it('field scoring is NOT affected by D25 (D25 never writes to player.fields)', () => {
    const player = createPlayer()
    // 1 real field
    player.fields.push({ row: 1, col: 0, crop: 'grain', amount: 0 })
    player.minorPlayed.push('D25_WitchesDanceFloor')
    player.extraOccupationsFromCards.push('D25_WitchesDanceFloor')

    const fieldsBefore = player.fields.length // 1

    const [result] = computeScores(createState(player))!
    const byKey = new Map(result!.categories.map((c) => [c.key, c]))

    // fields.length is unchanged after scoring
    expect(player.fields.length).toBe(fieldsBefore)

    // field score for quantity=1 → scoreByRanges(['0-1','2','3','4','5+']) → index 0 → -1
    expect(byKey.get('fields')?.quantity).toBe(1)
    expect(byKey.get('fields')?.total).toBe(-1)
  })

  it('extraOccupationsFromCards without corresponding minorPlayed entry does not appear in per-card scan', () => {
    // Edge case: if extraOccupationsFromCards is set but D25 is not in minorPlayed,
    // it should still not show up in per-card iteration (scoring only reads minorPlayed
    // and occupationPlayed directly).
    const player = createPlayer()
    player.extraOccupationsFromCards.push('D25_WitchesDanceFloor')
    // deliberately NOT adding to minorPlayed

    const [result] = computeScores(createState(player))!
    const byKey = new Map(result!.categories.map((c) => [c.key, c]))

    // cards category has zero entries
    expect(byKey.get('cards')?.entries ?? []).toHaveLength(0)
  })
})
