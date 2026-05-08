import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState, Resource } from '../../contract/types'
import { computeScores } from '../scoring'
import { Occupation } from '../../cards-display/types'
import { registerAdHocOccupation } from '../../cards/registry-runtime'

// Self-register the minor we use as a fixture
import '../../cards/B/B68_Beanfield'

// In-test fixture occupation: tests register an ad-hoc occupation so
// `getRegisteredOccupation('__TEST_OCC_VP__')` resolves. At time of writing no
// Occupation in our codebase has `vp >= 1`, so we fabricate one to exercise
// the printed-vp wiring on the occupation path.
registerAdHocOccupation(
  new Occupation({
    id: '__TEST_OCC_VP__',
    name: 'Test Occupation',
    deck: 'A',
    number: 0,
    desc: ['test fixture'],
    cost: {},
    vp: 1,
    players: '1+',
  }),
)

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
  occupationPlayed: [],houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
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

const cardsCategoryEntries = (player: PlayerState) => {
  const [result] = computeScores(createState(player))
  const cards = result.categories.find((c) => c.key === 'cards')
  return cards?.entries ?? []
}

describe('computeScores: printed vp on minors and occupations', () => {
  it('adds the printed vp of a minor improvement to its cards-category entry', () => {
    const player = createPlayer()
    player.minorPlayed = ['B68_Beanfield']

    const entries = cardsCategoryEntries(player)
    const entry = entries.find(
      (e) => e.type === 'card' && e.cardId === 'B68_Beanfield',
    )
    expect(entry).toBeDefined()
    expect(entry && 'score' in entry ? entry.score : undefined).toBe(1)
  })

  it('adds the printed vp of an occupation to its cards-category entry', () => {
    const player = createPlayer()
    player.occupationPlayed = ['__TEST_OCC_VP__']

    const entries = cardsCategoryEntries(player)
    const entry = entries.find(
      (e) => e.type === 'card' && e.cardId === '__TEST_OCC_VP__',
    )
    expect(entry).toBeDefined()
    expect(entry && 'score' in entry ? entry.score : undefined).toBe(1)
  })

  it('falls back to score 0 when the card is not registered (no printed vp)', () => {
    const player = createPlayer()
    player.minorPlayed = ['__NONEXISTENT_TEST_CARD__']

    const entries = cardsCategoryEntries(player)
    const entry = entries.find(
      (e) => e.type === 'card' && e.cardId === '__NONEXISTENT_TEST_CARD__',
    )
    expect(entry).toBeDefined()
    expect(entry && 'score' in entry ? entry.score : undefined).toBe(0)
  })
})
