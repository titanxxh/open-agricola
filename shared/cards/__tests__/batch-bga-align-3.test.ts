import { describe, expect, it } from 'vitest'
import {
  getRegisteredCardListeners,
  executeCardListener,
} from '../card-listeners'
import { getCardEffect } from '../card-effects'
import type { GameState, PlayerState, ActionSpace } from '../../game/types'

import '../A/A48_ShavingHorse'
import '../A/A101_CookeryOutfitter'
import '../A/A60_OrientalFireplace'
import '../D/D30_ArtisanDistrict'
import '../D/D59_EarthOven'
import '../major/cooking-hearth'
import '../major/fireplace'
import '../major/clay-oven'
import '../major/stone-oven'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: 'P1', color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    familySize: 2, workersAvailable: 2, rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [], playedCards: [],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    newbornCount: 0, pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
  }) as unknown as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 3, phase: 'work', currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as unknown as GameState

const createSpace = (id: string): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: null,
  }) as ActionSpace

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

// ===== A48 Shaving Horse thresholds =====
describe('A48_ShavingHorse thresholds', () => {
  const runFlow = (wood: number) => {
    const listener = findListener('A48-shaving-horse-after-gain')!
    const player = createPlayer()
    player.minorPlayed = ['A48_ShavingHorse']
    player.resources.wood = wood
    return executeCardListener(listener, {
      state: createState(player), player, space: createSpace('forest'),
      actionId: 'gain', phase: 'after',
      result: { type: 'ok', resourcesGained: { wood: 1 } },
    } as any)
  }
  it('no exchange below 5 wood', () => {
    expect(runFlow(4)).toBeUndefined()
  })
  it('optional exchange at 5-6 wood', () => {
    const r = runFlow(5) as any
    expect(r?.flow?.type).toBe('seq')
    expect(r?.flow?.optional).toBe(true)
  })
  it('optional exchange at 6 wood', () => {
    const r = runFlow(6) as any
    expect(r?.flow?.optional).toBe(true)
  })
  it('mandatory exchange at 7+ wood', () => {
    const r = runFlow(7) as any
    expect(r?.flow?.type).toBe('seq')
    expect(r?.flow?.optional).toBe(false)
  })
  it('mandatory exchange at 10 wood', () => {
    const r = runFlow(10) as any
    expect(r?.flow?.optional).toBe(false)
  })
})

// ===== A101 Cookery Outfitter =====
describe('A101_CookeryOutfitter counts isCookery improvements', () => {
  const effect = () => getCardEffect('A101_CookeryOutfitter')!
  it('counts cooking hearths and fireplaces', () => {
    const p = createPlayer()
    p.occupationPlayed = ['A101_CookeryOutfitter']
    p.improvements = ['Major_Fireplace1', 'Major_CookingHearth1']
    expect(effect().computeBonusScore!(createState(p), p)).toBe(2)
  })
  it('does not count ovens (Clay Oven / Stone Oven)', () => {
    const p = createPlayer()
    p.occupationPlayed = ['A101_CookeryOutfitter']
    p.improvements = ['Major_ClayOven', 'Major_StoneOven']
    expect(effect().computeBonusScore!(createState(p), p)).toBe(0)
  })
  it('counts majors + minors with isCookery (excludes pure ovens)', () => {
    const p = createPlayer()
    p.occupationPlayed = ['A101_CookeryOutfitter']
    p.improvements = ['Major_Fireplace1', 'Major_ClayOven']
    p.minorPlayed = ['A60_OrientalFireplace', 'D59_EarthOven']
    expect(effect().computeBonusScore!(createState(p), p)).toBe(3)
  })
  it('returns 0 when card not played', () => {
    const p = createPlayer()
    p.improvements = ['Major_Fireplace1']
    expect(effect().computeBonusScore!(createState(p), p)).toBe(0)
  })
})

// ===== D30 Artisan District bottom-row filter =====
describe('D30_ArtisanDistrict only counts bottom-row majors', () => {
  const effect = () => getCardEffect('D30_ArtisanDistrict')!
  it('returns 0 with 3 non-bottom-row majors (Fireplace, CookingHearth, Well)', () => {
    const p = createPlayer()
    p.minorPlayed = ['D30_ArtisanDistrict']
    p.improvements = ['Major_Fireplace1', 'Major_CookingHearth1', 'Major_Well']
    expect(effect().computeBonusScore!(createState(p), p)).toBe(0)
  })
  it('returns 2 with exactly 3 bottom-row majors', () => {
    const p = createPlayer()
    p.minorPlayed = ['D30_ArtisanDistrict']
    p.improvements = ['Major_ClayOven', 'Major_Joinery', 'Major_Pottery']
    expect(effect().computeBonusScore!(createState(p), p)).toBe(2)
  })
  it('returns 5 with 4 bottom-row majors', () => {
    const p = createPlayer()
    p.minorPlayed = ['D30_ArtisanDistrict']
    p.improvements = ['Major_ClayOven', 'Major_Joinery', 'Major_Pottery', 'Major_Basket']
    expect(effect().computeBonusScore!(createState(p), p)).toBe(5)
  })
  it('returns 8 with all 5 bottom-row majors', () => {
    const p = createPlayer()
    p.minorPlayed = ['D30_ArtisanDistrict']
    p.improvements = ['Major_ClayOven', 'Major_StoneOven', 'Major_Joinery', 'Major_Pottery', 'Major_Basket']
    expect(effect().computeBonusScore!(createState(p), p)).toBe(8)
  })
  it('ignores non-bottom-row majors when counting', () => {
    const p = createPlayer()
    p.minorPlayed = ['D30_ArtisanDistrict']
    p.improvements = ['Major_Fireplace1', 'Major_CookingHearth1', 'Major_ClayOven', 'Major_Joinery']
    expect(effect().computeBonusScore!(createState(p), p)).toBe(0) // only 2 bottom-row
  })
})
